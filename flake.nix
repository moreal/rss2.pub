{
  description = "rss2.pub — Atom to ActivityPub bridge";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: lib.genAttrs systems
        (system: f nixpkgs.legacyPackages.${system});
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      yarnVersion = lib.removePrefix "yarn@" packageJson.packageManager;
      # nixpkgs may lag behind the Yarn release pinned by packageManager. Keep
      # the CLI, offline fetcher, and config hook on that exact version. After
      # changing packageManager, refresh this source hash with:
      #   nix shell nixpkgs#nix-prefetch-github --command \
      #     nix-prefetch-github yarnpkg berry --rev '@yarnpkg/cli/<version>'
      yarnFor = pkgs:
        pkgs.yarn-berry_4.overrideAttrs (finalAttrs: _previousAttrs: {
          version = yarnVersion;
          src = pkgs.fetchFromGitHub {
            owner = "yarnpkg";
            repo = "berry";
            tag = "@yarnpkg/cli/${finalAttrs.version}";
            hash = "sha256-S15z3OXurZATj+eQxHo7zziV5NdcLfjFDBhCemhqOG8=";
          };
        });
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            (yarnFor pkgs)
            pkgs.postgresql_17
          ];
        };
      });

      packages = forAllSystems (pkgs:
        let
          yarn = yarnFor pkgs;
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
                # .yarn/* is gitignored except a few subpaths (patches,
                # plugins, ...); when none of those currently hold a tracked
                # file, git has nothing to check out under ./.yarn at all.
                (lib.fileset.maybeMissing ./.yarn)
                ./tsconfig.json
                ./tsconfig.build.json
                ./src
                ./packages
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
            missingHashes = ./nix/missing-hashes.json;
            yarnOfflineCache = yarn.fetchYarnBerryDeps {
              inherit (finalAttrs) src missingHashes;
              hash = "sha256-mMjvxqagbibBl/KEVm9DgY9CE3bHiEU+Jki9ANV7F+8=";
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
              cp -R dist node_modules drizzle package.json packages $out/lib/rss2pub/
              makeWrapper ${lib.getExe pkgs.nodejs_24} $out/bin/rss2pub \
                --chdir "$out/lib/rss2pub" \
                --add-flags dist/web/main.js
              runHook postInstall
            '';

            meta = {
              description = "Atom to ActivityPub bridge";
              homepage = "https://github.com/moreal/rss2.pub";
              mainProgram = "rss2pub";
            };
          });
        });
    };
}
