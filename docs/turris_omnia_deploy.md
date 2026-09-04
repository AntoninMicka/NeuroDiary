# Deploy na Turris Omnia

Nasazení používá existující multi-stage `backend/Dockerfile`, persistentní SQLite a lokální
soubor uživatelů. Google ani Apple ID nejsou nakonfigurované a aplikace při přihlášení nekontaktuje
globálního poskytovatele identity.

V lokálním režimu je přihlášení povinné; bez platné session se deník ani ostatní panely
nezobrazí. První účet vytvořený průvodcem dostane role `admin` a `patient`. Administrátor může
v panelu Administrace vytvářet a odstraňovat lokální účty a měnit jejich role. Backend nedovolí
odstranit právě přihlášený účet ani odebrat posledního administrátora. Hesla jsou v souboru
uložena pouze jako scrypt hash.

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
a vzdálených příkazů, celý průchod průvodcem si heslo k Omnii vyžádá nejvýše jednou. Pro pravidelné
aktualizace je stále vhodnější nastavit přihlášení SSH klíčem.

Aktuální stav lze kdykoliv vypsat samostatně:

```bash
bash scripts/omnia_status.sh
```

Výpis obsahuje síť routeru, disk, stav a IP LXC, stav systemd služby, healthcheck, paměť,
disk LXC a poslední varování NeuroDiary. Průvodce stejnou diagnostiku spustí po dokončení.

## Rychlá aktualizace aplikace

Po úspěšném prvním plném deployi lze další změny aplikace nasazovat bez `apt` a `pip`:

```bash
bash scripts/omnia_lxc_update.sh
```

Skript sestaví frontend, přenese pouze backend a statický frontend, restartuje službu a spustí
diagnostiku. Databáze, uživatelé, session klíč, Python prostředí ani systémové balíčky se nemění.
Předchozí aplikaci drží do úspěšného healthchecku a při chybě ji automaticky obnoví. Pokud se
změní `backend/requirements-lxc.txt`, je nutné místo něj znovu použít plný deploy.

### Varianta LXC

Pokud průvodce najde `lxc-attach`, nabídne režim `lxc`. Nejprve v reForis/LuCI vytvořte Debian
LXC kontejner připojený k `br-lan`, spusťte jej a poznamenejte si jeho název. Průvodce sestaví
frontend na počítači, do LXC nahraje backend a spustí jej jako omezenou systemd službu.
Na 32bit ARM automaticky doinstaluje také `libatomic1`, kompilátor C/C++ a Rust toolchain;
vývojové hlavičky Pythonu a knihoven. Ty jsou potřeba, pokud pro Python daného LXC není dostupný
hotový binární balíček. Uvicorn je použitý bez volitelných `uvloop` a `httptools`, aby se na
routeru zbytečně nekompilovaly.
LXC používá samostatný `backend/requirements-lxc.txt` bez PostgreSQL ovladače
`psycopg-binary`, který pro 32bit ARM nemá distribuovaný balíček a při SQLite není potřeba.

LXC deploy sestaví frontend s prefixem `/neurodiary/` a nainstaluje také integraci do Turris
WebApps. Dlaždice, ikona a lighttpd reverse proxy používají stejný mechanismus jako oficiální
integrace Syncthingu. Adresu kontejneru lze uvést v `omnia.env`:

```ini
LXC_IP=192.168.100.160
LXC_ZEROTIER_IP=10.43.192.160
```

Bez `LXC_IP` ji skript zjistí přes `lxc-info`. Před reloadem ověří upstream `/readyz` a celou
konfiguraci příkazem `lighttpd -tt`; při neplatné konfiguraci změny vrátí. Plný deploy i rychlý
LXC update následně ověří `/neurodiary/` a ikonu přes HTTPS na routeru.

### Vlastní HTTPS pro ZeroTier

LXC deploy při prvním spuštění vytvoří lokální certifikační autoritu a serverový certifikát
pro LAN i ZeroTier IP. CA vzniká v ignorovaném adresáři `secrets/tls`; její šifrovaný privátní
klíč se na router ani do LXC nepřenáší. Do LXC se přenese pouze serverový klíč, serverový
certifikát a veřejný certifikát CA.

Nginx v LXC ukončuje TLS na portu `443`, zatímco routerová WebApps proxy používá HTTP port
`8080`. Uvicorn naslouchá jen na `127.0.0.1:8000`. Přímá ZeroTier URL je:

```text
https://10.43.192.160/neurodiary/
```

Do každého klientského zařízení je potřeba jednorázově nainstalovat jako důvěryhodnou kořenovou
autoritu soubor `secrets/tls/neurodiary-ca.crt`. Soubor `neurodiary-ca.key` bezpečně zazálohujte;
nikdy jej nekopírujte na klienty ani na router.

V LAN se používá přímo IP adresa LXC a port `8080`. Pro přístup ze ZeroTier přidejte v síti
ZeroTier managed route pro LAN subnet (například `192.168.100.0/24`) přes ZeroTier adresu Omnie
a ve firewallu Turrisu povolte forwarding ze zóny ZeroTier pouze na IP LXC a TCP port 8080.

Ruční postup:

```bash
cp scripts/omnia.env.example scripts/omnia.env
# upravte OMNIA_HOST, LAN_IP a ZEROTIER_IP
ssh root@192.168.1.1 'mkdir -p /srv/neurodiary/config'
scp scripts/local_user.py root@192.168.1.1:/tmp/local_user.py
ssh -t root@192.168.1.1 'python3 /tmp/local_user.py /srv/neurodiary/config/users.json add antonin --name "Antonín"'
bash scripts/omnia_deploy.sh
```

Další deploy se provede stejným posledním příkazem. Databáze, účty a podpisový klíč session se
nepřepisují. Změny účtů se projeví bez restartu.

## Správa lokálních uživatelů

Z počítače lze správu provést přes SSH obálku, která používá `OMNIA_HOST` a `REMOTE_DIR`
ze souboru `scripts/omnia.env`. Hesla se zadávají skrytě až ve vzdáleném terminálu a nejsou
součástí argumentů ani historie shellu:

```bash
bash scripts/omnia_users.sh list
bash scripts/omnia_users.sh add jana --name "Jana" --roles patient
bash scripts/omnia_users.sh passwd jana
bash scripts/omnia_users.sh roles jana patient,family
bash scripts/omnia_users.sh delete jana
```

Přímo v shellu Turrisu lze použít stejný Python skript:

```bash
python3 /tmp/local_user.py /srv/neurodiary/config/users.json list
python3 /tmp/local_user.py /srv/neurodiary/config/users.json passwd jana
```

Skript zapisuje atomicky s oprávněním `0600`, kontroluje povolené role a nedovolí odebrat
posledního administrátora. Povolené role jsou `patient`, `family`, `doctor` a `admin`.

Port se publikuje jen na explicitní LAN a ZeroTier IP, nikoli na `0.0.0.0`. Přesto zkontrolujte
pravidla firewallu Turris a zakažte forward z WAN na `APP_PORT`. Pro PWA, WebCrypto a notifikace
je mimo `localhost` potřeba HTTPS; před běžným používáním proto před aplikaci nasaďte reverzní proxy
s certifikátem důvěryhodným pro všechna klientská zařízení.

Záloha minimálně zahrnuje `/srv/neurodiary/data`, `/srv/neurodiary/config/users.json` a
`/srv/neurodiary/config/session-secret`.
