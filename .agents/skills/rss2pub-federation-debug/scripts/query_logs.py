#!/usr/bin/env python3
"""Read rss2pub Loki logs through the configured HTTPS Grafana proxy."""
import argparse
import base64
import collections
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--homelab', type=Path, default=Path.home() / 'github/moreal/homelab')
    parser.add_argument('--since', default='6h')
    parser.add_argument('--query', default='{namespace="rss2pub",container="rss2pub"}')
    parser.add_argument('--limit', type=int, default=1000)
    args = parser.parse_args()
    if not 1 <= args.limit <= 5000:
        parser.error('--limit must be between 1 and 5000')
    inventory = json.loads((args.homelab / 'inventory/hosts.json').read_text())
    ingress = inventory['ingress']
    route = ingress['routes']['grafana']
    host = route.get('fqdn', 'grafana.' + ingress['domain'])
    secret = args.homelab / 'secrets/hosts' / route['host'] / 'monitoring.yaml'
    result = subprocess.run(['sops', '-d', '--extract', '["grafana_admin_password"]', str(secret)],
                            capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise SystemExit('SOPS decryption failed; details suppressed to protect credentials.')
    query = urllib.parse.urlencode(dict(query=args.query, since=args.since,
                                        limit=args.limit, direction='backward'))
    request = urllib.request.Request(
        'https://' + host + '/api/datasources/proxy/uid/loki/loki/api/v1/query_range?' + query,
        headers={'Authorization': 'Basic ' + base64.b64encode(
            ('admin:' + result.stdout.strip()).encode()).decode()})
    requested_at = datetime.now(timezone.utc).isoformat()
    # Never forward the Authorization header to an SSO redirect or another host.
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            payload = response.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f'Grafana HTTP {exc.code}; response and credentials suppressed.') from None
    data = json.loads(payload)
    if data.get('status') != 'success':
        raise SystemExit('Loki did not return success.')
    data['_collection'] = {'requested_at_utc': requested_at,
                           'grafana_host': host, 'query': args.query,
                           'since': args.since, 'limit': args.limit,
                           'direction': 'backward'}
    fd, filename = tempfile.mkstemp(prefix='rss2pub-loki-', suffix='.json')
    with os.fdopen(fd, 'wb') as output:
        output.write(json.dumps(data).encode())
    levels = collections.Counter()
    times = []
    for stream in data['data']['result']:
        for timestamp, line in stream['values']:
            times.append(int(timestamp))
            try:
                record = json.loads(line)
                levels[(record.get('level', 'unknown'), record.get('logger', 'unknown'))] += 1
            except (ValueError, AttributeError):
                levels[('unparsed', 'unknown')] += 1
    print(json.dumps({'private_log_file': filename, 'entries': len(times),
                      'possibly_truncated': len(times) >= args.limit,
                      'oldest_ns': min(times) if times else None,
                      'newest_ns': max(times) if times else None,
                      'counts': [{'level': k[0], 'logger': k[1], 'count': v}
                                 for k, v in levels.items()]}, indent=2))


if __name__ == '__main__':
    main()
