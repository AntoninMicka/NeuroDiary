<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Manuály</p>
        <h2>Uživatelský a správcovský manuál</h2>
      </div>
      <p class="panel-tip">Offline nápověda přímo v aplikaci pro běžný provoz i správu dat.</p>
    </div>

    <div class="manual-grid">
      <article class="manual-card">
        <div class="manual-card-head">
          <p class="manual-badge">Uživatel</p>
          <h3>Jak aplikaci běžně používat</h3>
        </div>

        <div class="manual-block">
          <h4>1. Rychlý zápis</h4>
          <p>
            Na uvodni obrazovce vyberte aktualni stav. Zapis vzdy pouzije skutecny systemovy cas
            v okamziku stisknuti tlacitka. Planovana davka se zobrazi pouze od 10 minut pred jejim
            casem do 60 minut po nem, vcetne odpoctu nebo informace o zpozdeni. Po zapsani z nabidky
            zmizi. Pokud se spletete, pouzijte nabidnutou akci <strong>Vratit posledni zapis</strong>.
          </p>
        </div>

        <div class="manual-block">
          <h4>2. Zpětný zápis v časovém karuselu</h4>
          <p>
            Karusel na uvodni obrazovce se posouva po 5 minutach a umoznuje zapsat stav nejvyse
            10 hodin zpet. Stav plati pro celou hodinu obsahujici vybrany cas. Tlacitko
            <strong>Ted</strong> vrati karusel k aktualnimu casu. Dosud nezapsanou davku lze doplnit
            se zvolenym casem uziti, ale jen do 60 minut od jejiho planovaneho casu.
          </p>
        </div>

        <div class="manual-block">
          <h4>3. Hodinová matice a denní zápis</h4>
          <p>
            Hodinova matice zustava jako doplnkovy pohled v nabidce <strong>Vice</strong>. Pro bezne
            a zpetne zapisy pouzivejte prednostne rychly zapis a jeho karusel. V Dennim zapisu
            doplnte kvalitu spanku, celkovy dojem ze dne a kratkou poznamku.
          </p>
        </div>

        <div class="manual-block">
          <h4>4. Léčba</h4>
          <p>
            Nejprve vytvorte pravidelny plan. Skutecne uzitou davku zapisujte pres rychly zapis.
            Pokud jste zapis zapomneli, pouzijte v povolene hodinove lhute casovy karusel.
            Sekce Lecba ukazuje, zda byla davka uzita vcas, drive, pozdeji, ceka na uziti nebo byla
            vynechana. Po uplynuti 60 minut uz vynechanou davku dodatecne zapsat nelze. Hodnoceni
            „vcas“ pouziva toleranci plus/minus 30 minut.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Připomenutí léků</h4>
          <p>
            V Lecbe lze zapnout systemova upozorneni a zvolit pripomenuti v case davky nebo 5–30
            minut predem. Prohlizec musi mit povolene notifikace. Aktivni Web Push umi upozorneni
            dorucit i po zavreni aplikace; bez nej funguje lokalni pripomenuti pouze pri otevrene
            nebo bezici aplikaci.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Časová osa, souhrn a trendy</h4>
          <p>
            Denni casova osa zobrazuje zaznamenane stavy a stav planovanych davek. Nejde o stejny
            prvek jako petiminutovy karusel pro zpetny zapis. Souhrn ukazuje 7 a 30 dni. Trendy
            nabizeji 30–365 dni, pokryti dat a vyvoj ON/OFF. Vysledky jsou orientacni a nenahrazuji
            lekarske hodnoceni.
          </p>
        </div>

        <div class="manual-block">
          <h4>7. Synchronizace</h4>
          <p>
            Tlacitko <strong>Synchronizovat</strong> v hlavni liste provede nejprve pull a potom
            push. Po lokalni zmene se zobrazi „Zmeny cekaji na sync“ a aplikace ji po kratkem odkladu
            automaticky odesle. Pri konfliktu se zaznamy slouci; smazane dny a davky maji mazaci
            znacky, aby se ze starsiho zarizeni nevratily. V nastaveni lze kontrolovat a odpojovat
            duveryhodna zarizeni nebo rotovat sifrovaci klic.
          </p>
        </div>

        <div class="manual-block">
          <h4>8. Tisk reportu</h4>
          <p>
            Tlačítkem <strong>Report pro lékaře</strong> otevřete tiskový report. Report lze také
            ulozit jako PDF nebo predat e-mailove aplikaci v AES-256 sifrovanem ZIP. Heslo k priloze
            vzdy predejte jinym kanalem. Pred sdilenim zkontrolujte udaje pacienta a cilovy e-mail.
          </p>
        </div>

        <div class="manual-block">
          <h4>9. Role a režim zařízení</h4>
          <p>
            Účet může mít více rolí, ale jejich aktivní kombinace se nastavuje samostatně pro každé
            důvěryhodné zařízení v sekci <strong>Údaje</strong>. Je-li aktivní role pacienta,
            aplikace zachová běžné pacientské rozhraní. Samotná role rodiny nebo lékaře přepne
            aplikaci do pečovatelského režimu s nabídkou Kartotéka, Kontakty, Sdílení dat, Manuály
            a Údaje. Nabídka <strong>Více</strong> obsahuje společné nástroje. Role sama nikdy
            nezpřístupní cizí zdravotní data; vždy je nutné platné sdílení od konkrétního pacienta.
          </p>
        </div>
      </article>

      <article class="manual-card">
        <div class="manual-card-head">
          <p class="manual-badge">Rodina a lékař</p>
          <h3>Práce se sdílenou kartotékou</h3>
        </div>

        <div class="manual-block">
          <h4>1. Otevření sdíleného deníku</h4>
          <p>
            V <strong>Kartotéce</strong> vyberte pacienta v levém seznamu. Přístup je dostupný až
            po přijetí a aktivaci pozvánky a pouze na důvěryhodném zařízení, pro které byl předán
            šifrovací klíč. Kartotéku lze prohledávat podle jména, e-mailu nebo roku narození.
          </p>
        </div>

        <div class="manual-block">
          <h4>2. Naplánovaná léčba pro rodinu</h4>
          <p>
            V detailu pacienta otevřete záložku <strong>Naplánovaná léčba</strong>. Rodinný
            příslušník vidí název, dávku, čas a období platnosti položek, ale nemůže plán měnit.
            Zobrazení slouží pouze jako informace podle dat zadaných pacientem a nenahrazuje pokyn
            lékaře ani kontrolu aktuálního předpisu.
          </p>
        </div>

        <div class="manual-block">
          <h4>3. Dávkový návrh lékaře</h4>
          <p>
            Lékař může ve stejné záložce upravit kopii současného léčebného plánu: změnit více
            položek, přidat nové nebo nepotřebné odebrat. Tlačítko
            <strong>Odeslat celý návrh pacientovi</strong> odešle všechny změny jako jeden celek.
            Součástí návrhu je důvod a vysvětlení změn pro pacienta. Odesláním se pacientův plán ještě nezmění.
          </p>
        </div>

        <div class="manual-block">
          <h4>4. Schválení pacientem</h4>
          <p>
            Pacient najde čekající návrh v sekci <strong>Sdílení dat</strong>. Může jej schválit
            a použít, zamítnout nebo vrátit lékaři k přepracování s povinnou připomínkou. Před rozhodnutím vidí zvlášť přidané, odebrané a upravené
            položky; u upravených hodnot je zobrazena původní i nová hodnota. Při schválení aplikace nahradí léčebný plán navrženou verzí a
            změnu následně synchronizuje. Pokud návrh vychází ze starší revize deníku, aplikace jej
            nepoužije; pacient musí nejprve synchronizovat data a lékař vytvořit aktuální návrh.
            Vrácený návrh může lékař otevřít v Datové správě a odeslat jako další verzi; původní
            verze, důvod změny i pacientova šifrovaná připomínka zůstávají v historii vlákna.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Datová správa a upozornění</h4>
          <p>
            Lékař má samostatnou sekci <strong>Datová správa</strong>, kde může návrhy filtrovat na
            rozepsané, čekající, schválené a zamítnuté a čekající návrh stáhnout. Rozpracovaný
            návrh se automaticky ukládá samostatně pro každého pacienta a po restartu jej lze obnovit
            nebo bezpečně smazat. Jeho zdravotní obsah je v místním úložišti šifrovaný pacientovým
            sdíleným klíčem a koncepty jsou oddělené podle přihlášeného lékařského účtu. Nový návrh upozorní pacienta;
            schválení nebo zamítnutí upozorní lékaře. Upozornění se zobrazí v aplikaci a při
            povolených systémových notifikacích také v prohlížeči. Je-li nakonfigurován Web Push a
            zařízení je registrováno, může zpráva dorazit i po zavření aplikace.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Soukromí a odpovědnost</h4>
          <p>
            Návrh léčby je end-to-end šifrovaný stejně jako deník. Server ukládá pouze šifrovaný
            obsah, stav žádosti a technická metadata. Odeslání vyžaduje aktivní roli lékaře;
            rozhodnutí vyžaduje aktivní roli pacienta. Vytvoření i rozhodnutí se zapisují do
            bezpečnostního auditu. Před schválením má pacient vždy ověřit změny se svým lékařem.
          </p>
        </div>
      </article>

      <article class="manual-card">
        <div class="manual-card-head">
          <p class="manual-badge">Správce</p>
          <h3>Správa dat a provozní postupy</h3>
        </div>

        <div class="manual-block">
          <h4>1. Úložiště dat</h4>
          <p>
            Aplikace pracuje primarne offline. Podle prostredi muze pouzit SQLite uloziste nebo
            fallback vrstvu nad <code>localStorage</code>. Aktualni rezim je viditelny v horni liste.
          </p>
        </div>

        <div class="manual-block">
          <h4>2. Export a import</h4>
          <p>
            Tlacitka <strong>Export .sqlite</strong>, <strong>Export JSON</strong> a
            <strong>Import .sqlite</strong>, <strong>Import JSON</strong> slouzi pro prenos nebo
            obnovu lokalni databaze.
            JSON export je vhodny jako citelna zalohovaci a integracni varianta, SQLite export jako
            plna binarni kopie. Pokud fallback rezim SQLite nepodporuje, aplikace na to uzivatele
            upozorni.
          </p>
        </div>

        <div class="manual-block">
          <h4>3. Kontrola integrity a validace</h4>
          <p>
            Volba <strong>Kontrola integrity dat</strong> overi datumy, casy, davky, duplicity,
            hodinove zaznamy a mazaci znacky. Chybne vstupy se oznaci uz ve formulari. Pred resenim
            nalezene chyby nejprve vytvorte JSON nebo SQLite zalohu.
          </p>
        </div>

        <div class="manual-block">
          <h4>4. Cloudová synchronizace a obnova</h4>
          <p>
            Synchronizační kopie je před odesláním šifrována v zařízení. Obnovovací kód uchovávejte mimo
            aplikaci; pro druhe zarizeni lze pouzit QR prenos. Pri zmene cloudoveho uctu se lokalni
            sync klic odpoji a musi se znovu obnovit. Rotace klice odpoji ostatni zarizeni a vytvori
            novy recovery secret, ktery je nutne znovu bezpečne ulozit.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Doporučený provoz</h4>
          <p>
            Pred aktualizaci aplikace nebo testovanim nove verze vytvorte export databaze. Pri
            sdileni reportu kontrolujte, zda neobsahuje vice osobnich udaju, nez je potreba.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Monitoring backendu</h4>
          <p>
            Produkcni backend poskytuje <code>/healthz</code>, <code>/readyz</code> a
            <code>/api/v1/meta</code>. Logy pouzivaji request ID a nesmi obsahovat sifrovany payload,
            token, e-mail ani zdravotni data. Incidentni postup je v technickem provoznim manualu.
          </p>
        </div>

        <div class="manual-block">
          <h4>7. Správa rolí a návrhů léčby</h4>
          <p>
            Role lékaře a administrátora přiděluje pouze správce. Server při vytvoření návrhu
            léčby ověřuje aktivní lékařskou roli, důvěryhodné zařízení a platný grant ke konkrétnímu
            pacientovi. Rozhodnout smí pouze vlastník deníku s aktivní rolí pacienta. Při řešení
            incidentu používejte auditní události vytvoření, schválení nebo zamítnutí návrhu;
            šifrovaný zdravotní obsah se do provozních logů nezapisuje.
          </p>
        </div>

        <div class="manual-block">
          <h4>8. Omezení prototypu</h4>
          <p>
            Analytické funkce jsou dostupné pouze při aktivní roli lékaře a jsou výrazně označené
            jako necertifikované. Nejde o zdravotnický prostředek ani podklad pro diagnózu nebo
            změnu léčby. Analýzy a analytické metriky jsou v tiskových a PDF reportech vypnuté.
          </p>
        </div>

      </article>
    </div>
  </section>
</template>
