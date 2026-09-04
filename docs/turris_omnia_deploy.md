# Deploy na Turris Omnia

Nasazení používá existující multi-stage `backend/Dockerfile`, persistentní SQLite a lokální
soubor uživatelů. Google ani Apple ID nejsou nakonfigurované a aplikace při přihlášení nekontaktuje
globálního poskytovatele identity.

## Předpoklady

- na Omnii běží ZeroTier a `podman` nebo `docker`
- build potřebuje přibližně 2 GB volného místa; datový adresář dej ideálně na externí disk
- SSH přístup klíčem a `rsync` na počítači i routeru

## První instalace

```bash
cp scripts/omnia.env.example scripts/omnia.env
# upravte OMNIA_HOST, LAN_IP a ZEROTIER_IP
ssh root@192.168.1.1 'mkdir -p /srv/neurodiary/config'
scp scripts/local_user.py root@192.168.1.1:/tmp/local_user.py
ssh -t root@192.168.1.1 'python3 /tmp/local_user.py /srv/neurodiary/config/users.json antonin --name "Antonín"'
bash scripts/omnia_deploy.sh
```

Další deploy se provede stejným posledním příkazem. Databáze, účty a podpisový klíč session se
nepřepisují. Další účet přidáte opět přes `local_user.py`; změna se projeví bez restartu.

Port se publikuje jen na explicitní LAN a ZeroTier IP, nikoli na `0.0.0.0`. Přesto zkontrolujte
pravidla firewallu Turris a zakažte forward z WAN na `APP_PORT`. Pro PWA, WebCrypto a notifikace
je mimo `localhost` potřeba HTTPS; před běžným používáním proto před aplikaci nasaďte reverzní proxy
s certifikátem důvěryhodným pro všechna klientská zařízení.

Záloha minimálně zahrnuje `/srv/neurodiary/data`, `/srv/neurodiary/config/users.json` a
`/srv/neurodiary/config/session-secret`.
