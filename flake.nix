{
  description = "rss2.pub — RSS/Atom to ActivityPub bridge";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: lib.genAttrs systems
        (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.yarn-berry
            pkgs.postgresql_17
          ];
        };
      });

      packages = forAllSystems (pkgs:
        let
          yarn = pkgs.yarn-berry_4;
        in
        {
          default = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "rss2pub";
            version = "0.1.0";

            src = lib.fileset.toSource {
              root = ./.;
              fileset = lib.fileset.unions [
                ./package.json
                ./yarn.lock
                ./.yarnrc.yml
                ./.yarn
                ./tsconfig.json
                ./tsconfig.build.json
                ./src
                ./drizzle
              ];
            };

            # Every yarn.lock change requires refreshing both files:
            #   nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- \
            #     missing-hashes yarn.lock > nix/missing-hashes.json
            #   nix run nixpkgs#yarn-berry_4-fetcher.yarn-berry-fetcher -- \
            #     prefetch yarn.lock nix/missing-hashes.json
            # (missing-hashes covers platform-conditional packages — e.g.
            # esbuild binaries — whose checksums yarn.lock omits.)
            #
            # Known gap: nixpkgs ships yarn-berry_4 4.14.1 while the repo pins
            # 4.17.1 (packageManager). Yarn's builtin typescript compat patch
            # differs between those versions (lockfile hash=3bafbf vs 5786d5),
            # so the offline install inside the sandbox currently fails at the
            # typescript patch step. Fix by bumping nixpkgs once yarn-berry_4
            # reaches 4.17.x, or by overriding the yarn-berry scope.
            missingHashes = ./nix/missing-hashes.json;
            yarnOfflineCache = yarn.fetchYarnBerryDeps {
              inherit (finalAttrs) src missingHashes;
              hash = "sha256-b8oN4jUz2PntCeKZDVb4QHSCcYzQXACOhLmIcX9hiOI=";
            };

            nativeBuildInputs = [
              pkgs.nodejs_24
              yarn
              yarn.yarnBerryConfigHook
              pkgs.makeWrapper
            ];

            buildPhase = ''
              runHook preBuild
              yarn build
              runHook postBuild
            '';

            # node_modules is copied wholesale (nodeLinker: pnpm layout with
            # relative symlinks into node_modules/.store); dev dependencies are
            # included because the TypeScript build needs them — pruning to
            # production-only is a future size optimization.
            installPhase = ''
              runHook preInstall
              mkdir -p $out/lib/rss2pub $out/bin
              cp -R dist node_modules drizzle package.json $out/lib/rss2pub/
              makeWrapper ${lib.getExe pkgs.nodejs_24} $out/bin/rss2pub \
                --chdir "$out/lib/rss2pub" \
                --add-flags dist/web/main.js
              runHook postInstall
            '';

            meta = {
              description = "RSS/Atom to ActivityPub bridge";
              homepage = "https://github.com/moreal/rss2.pub";
              mainProgram = "rss2pub";
            };
          });
        });
    };
}
