# Optional maintainer shell. Contributors only need Node 24 and pnpm.
{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm.enable = true;
  };

  # tshark, used to import raw Bluetooth captures into fixtures.
  packages = [ pkgs.wireshark-cli ];
}
