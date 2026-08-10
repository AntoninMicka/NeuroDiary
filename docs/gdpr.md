# GDPR a soukromí

Tento dokument je technický podklad pro záznamy o činnostech zpracování, posouzení rizik a
budoucí informace uživatelům. Není právním stanoviskem. Před produkčním provozem musí provozovatel
doplnit svou identitu, kontakty, zvolené právní tituly a potvrdit dokument s odborníkem na ochranu
osobních údajů.

## Role a hranice systému

NeuroDiary je offline-first zdravotní deník. Bez zapnutí cloudu zůstávají data deníku pouze v zařízení
uživatele. Po zapnutí synchronizace backend zpracovává identitu účtu, provozní metadata a end-to-end
šifrovaný obsah. Provozovatel backendu je pro serverové zpracování předpokládaným správcem; jeho
konkrétní identita a kontakty zatím nejsou v projektu určeny.

Google a Apple ověřují identitu podle zvoleného poskytovatele. Google Cloud je předpokládaný
zpracovatel hostingu a databáze. Pro Web Push se uplatní infrastruktura výrobce prohlížeče nebo
operačního systému. Přesný seznam zpracovatelů, jejich lokality a smluvní záruky musí být před
produkčním spuštěním potvrzen provozovatelem.

## Inventář činností zpracování

| Činnost | Subjekty a data | Účel | Návrh právního titulu | Příjemci | Retence / výmaz |
| --- | --- | --- | --- | --- | --- |
| Lokální deník | pacient; zdravotní stavy, medikace, poznámky, profil | vedení deníku, analýzy a reporty | mimo server; titul musí provozovatel posoudit podle distribučního modelu | nikdo bez akce uživatele | do lokálního výmazu nebo odinstalace; lokální zálohy nejvýše 7 verzí |
| Cloudový účet | identifikátor poskytovatele, e-mail, jméno, role | přihlášení, oddělení účtů a správa oprávnění | plnění služby; pro zvláštní kategorie samo o sobě nestačí | Google/Apple, provozovatel backendu | po dobu účtu; následně jen nezbytná bezpečnostní či právní evidence |
| Synchronizace | E2E šifrovaný snapshot, revize, verze klíče, čas změny | synchronizace mezi zařízeními | výslovně aktivovaná služba; titul a výjimku podle čl. 9 potvrdit před produkcí | Google Cloud; sdílející osoby pouze přes aktivní grant | do resetu synchronizace nebo výmazu účtu; zálohy podle samostatné lhůty |
| Důvěryhodná zařízení a klíče | ID a název zařízení, veřejný klíč, fingerprint, obálky klíče | bezpečný přenos klíče, revokace a obnova | nezbytnost pro zabezpečení služby | provozovatel backendu | po dobu registrace zařízení; čekající přenosy do expirace |
| Sdílení a návrhy léčby | identity účastníků, granty, stav pozvánek, E2E šifrované návrhy | uživatelem řízené sdílení s rodinou nebo lékařem | výslovná akce pacienta; právní titul a čl. 9 potvrdit | výslovně zvolený příjemce | do odvolání, expirace nebo výmazu účtu; audit podle auditní lhůty |
| Push připomínky | push endpoint a klíče, anonymní UTC plán | obecné připomenutí bez názvu léku a dávky | souhlas se systémovými notifikacemi | push služba prohlížeče/OS | do vypnutí notifikací, expirace endpointu nebo výmazu účtu |
| Odeslání reportu | kontakt lékaře lokálně, šifrovaný ZIP/PDF, Gmail OAuth token v klientovi | jednorázové sdílení reportu | přímá akce uživatele | zvolený e-mailový poskytovatel a adresát | server NeuroDiary token ani přílohu neukládá; lokální soubor řídí uživatel |
| Bezpečnostní audit | účet, zařízení, typ události, omezená technická metadata, HMAC řetězec | zabezpečení, dohledatelnost a řešení incidentů | oprávněný zájem / právní povinnost musí potvrdit provozovatel | oprávněná podpora, bezpečnost nebo auditor | výchozí 730 dní, konfigurovatelně 30–3650 dní |
| Provozní logy | request ID, cesta, stav, latence, typ chyby | dostupnost, diagnostika a bezpečnost | oprávněný zájem na bezpečném provozu | provozovatel a Google Cloud Logging | konkrétní lhůta zatím není nastavena; musí být určena před produkcí |
| Cloud SQL zálohy | databáze včetně šifrovaných payloadů a provozních metadat | obnova po havárii | nezbytnost a bezpečnost služby | provozovatel a Google Cloud | aktuálně doporučeno 7 automatických záloh; ověřit skutečné nastavení a mazání |

## Zásady a omezení

- Zdravotní obsah je zvláštní kategorií osobních údajů. Nestačí určit pouze titul podle článku 6;
  provozovatel musí doložit také použitelnou výjimku podle článku 9.
- Souhlas se nesmí používat jako univerzální náhrada chybějícího právního titulu. Pokud se na něj
  konkrétní činnost spoléhá, musí být svobodný, konkrétní, informovaný, prokazatelný a odvolatelný
  bez újmy.
- Cloudová synchronizace, sdílení, notifikace a budoucí sekundární analytika musí být oddělené volby.
- Backend nesmí logovat otevřená zdravotní data, tokeny, recovery secret ani soukromé klíče.
- E2E šifrování snižuje rozsah čitelného obsahu u provozovatele, ale šifrovaný payload a související
  identifikátory zůstávají daty, se kterými je nutné zacházet jako s osobními údaji.
- Nový účel, příjemce nebo kategorie dat vyžaduje aktualizaci tohoto inventáře, informací uživateli
  a podle rizika také DPIA.

## Práva a požadované technické toky

| Právo / požadavek | Současný stav | Chybějící krok |
| --- | --- | --- |
| Informace a transparentnost | technická dokumentace | veřejná privacy policy s identitou správce a verzí |
| Přístup | lokální data jsou dostupná v aplikaci | serverový export účtu, zařízení, grantů a auditu |
| Oprava | deník a profil lze měnit lokálně | vyjasnit opravu identity převzaté od poskytovatele |
| Výmaz | reset smaže cloudový snapshot | atomický výmaz účtu, zařízení, grantů, push dat a plán výmazu ze záloh |
| Omezení a námitka | není samostatný workflow | provozní proces a kontaktní kanál správce |
| Přenositelnost | JSON a SQLite export | jeden dokumentovaný strojově čitelný export serverových i lokálních dat |
| Odvolání souhlasu | notifikace a sdílení lze vypnout | verzovaný registr souhlasů a jednotné odvolání příslušného zpracování |

## Otevřená rozhodnutí před produkčním použitím

1. Doplnit správce, kontaktní údaje, případného pověřence a dozorový úřad.
2. Právně potvrdit titul podle článku 6 a výjimku podle článku 9 pro každou serverovou činnost.
3. Uzavřít a evidovat zpracovatelské smlouvy; zdokumentovat umístění dat a případné mezinárodní přenosy.
4. Nastavit konkrétní retenci Cloud Logging, databázových záloh, pozvánek, přenosů klíčů a účtů.
5. Provést DPIA před ostrým zpracováním zdravotních dat ve větším rozsahu nebo přidáním AI analýz.
6. Určit proces vyřízení žádostí, ověření žadatele, lhůt, výjimek a bezpečného předání exportu.

## Normativní podklad

- Nařízení (EU) 2016/679: zejména zásady a právní tituly (čl. 5–7), zvláštní kategorie (čl. 9),
  transparentnost a práva (čl. 12–22), záznamy o činnostech (čl. 30), zabezpečení (čl. 32) a DPIA
  (čl. 35).
- EDPB Guidelines 05/2020 on consent under Regulation 2016/679.

