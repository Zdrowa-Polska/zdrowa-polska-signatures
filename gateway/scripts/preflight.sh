#!/usr/bin/env bash
set -euo pipefail

echo "=== Host ==="
hostname -f || true
cat /etc/os-release | sed -n '1,8p'
echo

echo "=== Listening sockets ==="
sudo ss -ltnp | grep -E ':(25|587|10025|10026|10027)\b' || true
echo

echo "=== Postfix version / SASL support ==="
postconf mail_version
postconf -a || true
echo

echo "=== Postfix effective main.cf (relevant) ==="
sudo postconf   myhostname mynetworks relayhost   content_filter smtpd_tls_cert_file smtpd_tls_key_file   smtpd_sasl_type smtpd_sasl_path smtpd_sasl_auth_enable   smtpd_relay_restrictions smtpd_recipient_restrictions   2>/dev/null || true
echo

echo "=== Postfix master.cf relevant services ==="
sudo grep -nE '^(smtp|submission|smtps|10025|10026|10027)|content_filter|smtpd_sasl|smtpd_tls' /etc/postfix/master.cf || true
echo

echo "=== Existing signature gateway unit ==="
sudo systemctl cat zp-signature-gateway.service || true
sudo systemctl --no-pager --full status zp-signature-gateway.service || true
echo

echo "=== Existing gateway directory ==="
sudo find /opt/zp-signature-gateway -maxdepth 1 -type f -printf '%f\n' | sort || true
echo

echo "=== Existing filter reinjection variables / code references ==="
sudo grep -nE 'REINJECT|10025|10026|email-smtp|smtplib|SMTP\(' /opt/zp-signature-gateway/filter.py 2>/dev/null || true
echo

echo "=== TLS certificate ==="
sudo ls -l /etc/letsencrypt/live/signature-gateway.zdrowapolskagroup.pl/ 2>/dev/null || true
sudo openssl x509   -in /etc/letsencrypt/live/signature-gateway.zdrowapolskagroup.pl/fullchain.pem   -noout -subject -issuer -dates 2>/dev/null || true
echo

echo "=== Dovecot present? ==="
command -v dovecot || true
sudo test -d /etc/dovecot && sudo find /etc/dovecot -maxdepth 2 -type f -printf '%p\n' | sort | head -80 || true
echo

echo "=== Firewall note ==="
echo "This script does NOT change Google Cloud firewall rules."
echo
echo "PRE-FLIGHT COMPLETE: no configuration was changed."
