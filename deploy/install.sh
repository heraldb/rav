#!/usr/bin/env bash
# Install or upgrade Rav on CentOS Stream 10. Run as root from the unpacked
# tarball directory:  cd rav && sudo ./install.sh
set -euo pipefail

cd "$(dirname "$0")"

# RAV_DOMAIN etc., copied into the tarball by build-native.sh
. ./site.env

# Binary + frontend
install -d -m 0755 /opt/rav
install -m 0755 rav-email-server /opt/rav/rav-email-server.new
mv -f /opt/rav/rav-email-server.new /opt/rav/rav-email-server
rm -rf /opt/rav/static.new
cp -r static /opt/rav/static.new
rm -rf /opt/rav/static
mv /opt/rav/static.new /opt/rav/static
chmod -R a+rX /opt/rav
restorecon -R /opt/rav 2>/dev/null || true

# Config: never overwrite an existing one
install -d -m 0755 /etc/rav
if [ ! -f /etc/rav/rav.env ]; then
    install -m 0640 rav.env.example /etc/rav/rav.env
    echo "Created /etc/rav/rav.env, review it before starting the service."
fi

# Password change helper (PASSWORD_CHANGE_COMMAND in rav.env)
install -d -m 0755 /usr/local/libexec
install -m 0755 rav-passwd-dovecot-sql /usr/local/libexec/rav-passwd
restorecon /usr/local/libexec/rav-passwd 2>/dev/null || true

# systemd unit
install -m 0644 rav.service /etc/systemd/system/rav.service
# The helper reads its database login through LoadCredential=. Only add the
# drop-in when the option file exists: a missing credential stops rav starting.
if [ -f /etc/rav/passwd-db.cnf ]; then
    install -d -m 0755 /etc/systemd/system/rav.service.d
    printf '[Service]\nLoadCredential=rav-passwd-db:/etc/rav/passwd-db.cnf\n' \
        > /etc/systemd/system/rav.service.d/password-change.conf
else
    echo "No /etc/rav/passwd-db.cnf: password changes stay unavailable until it exists and install.sh is rerun."
fi
systemctl daemon-reload

# nginx log directory used by the site config; nginx's master process
# (root) writes the logs. restorecon gives it the httpd_log_t context.
install -d -m 0750 /var/log/nginx/rav
restorecon /var/log/nginx/rav 2>/dev/null || true

# nginx site: only on first install
if [ ! -f "/etc/nginx/conf.d/${RAV_DOMAIN}.conf" ]; then
    install -m 0644 nginx-site.conf "/etc/nginx/conf.d/${RAV_DOMAIN}.conf"
    echo "Installed nginx config, run: nginx -t && systemctl reload nginx"
fi

# Let nginx connect to the local backend port (SELinux)
if command -v getsebool >/dev/null && ! getsebool httpd_can_network_connect | grep -q 'on$'; then
    setsebool -P httpd_can_network_connect 1
fi

if systemctl is-active --quiet rav; then
    systemctl restart rav
    echo "Restarted rav."
else
    echo "Start with: systemctl enable --now rav"
fi
