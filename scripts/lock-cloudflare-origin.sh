#!/bin/bash
# Run on the origin after DNS proxying and the Caddy peer filter are verified.
# Leaves SSH rules alone. A timed rollback protects against loss of website access.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Root is required.'; exit 1; }
ufw status | grep -q 'Status: active'
backup=$(mktemp -d /root/circlo-origin-firewall.XXXXXX)
cp -p /etc/ufw/user.rules /etc/ufw/user6.rules "$backup/"
cat > "$backup/rollback.sh" <<EOF
#!/bin/sh
cp -p '$backup/user.rules' /etc/ufw/user.rules
cp -p '$backup/user6.rules' /etc/ufw/user6.rules
ufw reload
EOF
chmod 700 "$backup/rollback.sh"
unit="circlo-origin-rollback-$(date +%s)"
systemd-run --quiet --unit="$unit" --on-active=180 "$backup/rollback.sh"
verified=0
trap 'systemctl stop "$unit.timer" || true; if [ "$verified" != 1 ]; then "$backup/rollback.sh"; fi' EXIT
# Download only the provider's official list and validate every CIDR before applying it.
python3 - "$backup/ranges" <<'PY'
import ipaddress,json,sys,urllib.request
ranges=[]
request=urllib.request.Request('https://api.cloudflare.com/client/v4/ips',headers={'User-Agent':'Circlo-Origin-Protection/1.0'})
with urllib.request.urlopen(request,timeout=15) as response:
    data=json.loads(response.read(16384))
assert data['success'] is True
for family in (4,6):
    lines=data['result']['ipv'+str(family)+'_cidrs']
    assert 5 <= len(lines) <= 100
    for value in lines:
        network=ipaddress.ip_network(value.strip(),strict=True)
        assert network.version==family and network.is_global
        assert network.prefixlen >= (8 if family==4 else 19)
        ranges.append(str(network))
open(sys.argv[1],'w').write('\n'.join(ranges)+'\n')
PY
while IFS= read -r range; do
  ufw allow proto tcp from "$range" to any port 80,443 comment circlo-cloudflare >/dev/null
done < "$backup/ranges"
ufw delete allow 80/tcp >/dev/null
ufw delete allow 443/tcp >/dev/null
curl --fail --silent --show-error --max-time 20 https://circlo.chat/api/app-version >/dev/null
verified=1
printf 'Cloudflare-only web ingress verified; SSH rules preserved. Rollback: %s/rollback.sh\n' "$backup"
