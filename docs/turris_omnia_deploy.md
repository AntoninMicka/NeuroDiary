# Deploy na Turris Omnia

Nasazení používá existující multi-stage `backend/Dockerfile`, persistentní SQLite a lokální
soubor uživatelů. Google ani Apple ID nejsou nakonfigurované a aplikace při přihlášení nekontaktuje
globálního poskytovatele identity.

## Předpoklady

- na Omnii běží ZeroTier a `podman`, `docker`, nebo již vytvořený Debian LXC kontejner
- build potřebuje přibližně 2 GB volného místa; datový adresář dej ideálně na externí disk
- SSH přístup klíčem a `rsync` na počítači i routeru

## První instalace

Nejjednodušší cesta je interaktivní průvodce:

```bash
bash scripts/omnia_setup_wizard.sh
```

Průvodce zkontroluje SSH, zjistí síťové adresy a container runtime, založí lokální účet,
uloží `scripts/omnia.env` s oprávněním `0600` a nabídne spuštění deploye. Heslo se zadává
lokálně skrytým vstupem a přes SSH se nepřenáší v argumentech příkazu.

Pokud je nalezeno více runtime, LXC kontejnerů nebo IPv4 rozhraní, průvodce zobrazí číslovaný
výběr a možnost zadat vlastní hodnotu. Rozhraní obsahující `guest` je viditelně označené a jeho
použití vyžaduje dodatečné potvrzení. Chyby připojení, validace, přenosu účtu a deploye nabídnou
opakování příslušného kroku; průvodce se při nich sám neukončí.

SSH adresu Omnie průvodce předvyplní jako `root@VÝCHOZÍ_BRÁNA` podle routovací tabulky počítače.
Jde pouze o návrh, který lze změnit; existující hodnota v `scripts/omnia.env` má přednost.

Samotný deploy používá multiplexovanou SSH relaci. I když sestává z několika přenosů přes `rsync`
a vzdálených příkazů, heslo k Omnii si během deploye vyžádá nejvýše jednou. Pro pravidelné
aktualizace je stále vhodnější nastavit přihlášení SSH klíčem.

### Varianta LXC

Pokud průvodce najde `lxc-attach`, nabídne režim `lxc`. Nejprve v reForis/LuCI vytvořte Debian
LXC kontejner připojený k `br-lan`, spusťte jej a poznamenejte si jeho název. Průvodce sestaví
frontend na počítači, do LXC nahraje backend a spustí jej jako omezenou systemd službu.

V LAN se používá přímo IP adresa LXC a port `8080`. Pro přístup ze ZeroTier přidejte v síti
ZeroTier managed route pro LAN subnet (například `192.168.100.0/24`) přes ZeroTier adresu Omnie
a ve firewallu Turrisu povolte forwarding ze zóny ZeroTier pouze na IP LXC a TCP port 8080.

Ruční postup:

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
