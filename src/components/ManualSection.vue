<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Manualy</p>
        <h2>Uzivatelsky a spravcovsky manual</h2>
      </div>
      <p class="panel-tip">Offline napoveda primo v aplikaci pro bezny provoz i spravu dat.</p>
    </div>

    <div class="manual-grid">
      <article class="manual-card">
        <div class="manual-card-head">
          <p class="manual-badge">Uzivatel</p>
          <h3>Jak aplikaci bezne pouzivat</h3>
        </div>

        <div class="manual-block">
          <h4>1. Rychly zapis</h4>
          <p>
            Na uvodni obrazovce vyberte aktualni stav. Zapis vzdy pouzije skutecny systemovy cas
            v okamziku stisknuti tlacitka. Planovana davka se zobrazi pouze od 10 minut pred jejim
            casem do 60 minut po nem, vcetne odpoctu nebo informace o zpozdeni. Po zapsani z nabidky
            zmizi. Pokud se spletete, pouzijte nabidnutou akci <strong>Vratit posledni zapis</strong>.
          </p>
        </div>

        <div class="manual-block">
          <h4>2. Zpetny zapis v casovem karuselu</h4>
          <p>
            Karusel na uvodni obrazovce se posouva po 5 minutach a umoznuje zapsat stav nejvyse
            10 hodin zpet. Stav plati pro celou hodinu obsahujici vybrany cas. Tlacitko
            <strong>Ted</strong> vrati karusel k aktualnimu casu. Dosud nezapsanou davku lze doplnit
            se zvolenym casem uziti, ale jen do 60 minut od jejiho planovaneho casu.
          </p>
        </div>

        <div class="manual-block">
          <h4>3. Hodinova matice a denni zapis</h4>
          <p>
            Hodinova matice zustava jako doplnkovy pohled v nabidce <strong>Vice</strong>. Pro bezne
            a zpetne zapisy pouzivejte prednostne rychly zapis a jeho karusel. V Dennim zapisu
            doplnte kvalitu spanku, celkovy dojem ze dne a kratkou poznamku.
          </p>
        </div>

        <div class="manual-block">
          <h4>4. Lecba</h4>
          <p>
            Nejprve vytvorte pravidelny plan. Skutecne uzitou davku zapisujte pres rychly zapis.
            Pokud jste zapis zapomneli, pouzijte v povolene hodinove lhute casovy karusel.
            Sekce Lecba ukazuje, zda byla davka uzita vcas, drive, pozdeji, ceka na uziti nebo byla
            vynechana. Po uplynuti 60 minut uz vynechanou davku dodatecne zapsat nelze. Hodnoceni
            „vcas“ pouziva toleranci plus/minus 30 minut.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Pripomenuti leku</h4>
          <p>
            V Lecbe lze zapnout systemova upozorneni a zvolit pripomenuti v case davky nebo 5–30
            minut predem. Prohlizec musi mit povolene notifikace. Aktivni Web Push umi upozorneni
            dorucit i po zavreni aplikace; bez nej funguje lokalni pripomenuti pouze pri otevrene
            nebo bezici aplikaci.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Casova osa, souhrn a trendy</h4>
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
            Tlacitkem <strong>Print report</strong> otevrite tiskovy report pro lekare. Report lze take
            ulozit jako PDF nebo predat e-mailove aplikaci v AES-256 sifrovanem ZIP. Heslo k priloze
            vzdy predejte jinym kanalem. Pred sdilenim zkontrolujte udaje pacienta a cilovy e-mail.
          </p>
        </div>
      </article>

      <article class="manual-card">
        <div class="manual-card-head">
          <p class="manual-badge">Spravce</p>
          <h3>Sprava dat a provozni postupy</h3>
        </div>

        <div class="manual-block">
          <h4>1. Uloziste dat</h4>
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
          <h4>4. Cloud sync a recovery</h4>
          <p>
            Sync snapshot je pred odeslanim sifrovan na zarizeni. Recovery secret uchovavejte mimo
            aplikaci; pro druhe zarizeni lze pouzit QR prenos. Pri zmene cloudoveho uctu se lokalni
            sync klic odpoji a musi se znovu obnovit. Rotace klice odpoji ostatni zarizeni a vytvori
            novy recovery secret, ktery je nutne znovu bezpečne ulozit.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Doporuceny provoz</h4>
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
          <h4>7. Omezeni prototypu</h4>
          <p>
            Soucasna verze je prototyp. Klinicka interpretace statistik, dlouhodobych trendu a
            reportovych metrik musi byt overena se specializovanym lekarem.
          </p>
        </div>

      </article>
    </div>
  </section>
</template>
