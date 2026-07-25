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
            Na uvodni obrazovce vyberte aktualni stav nebo davku z planu. Zapis pouzije skutecny
            systemovy cas v okamziku stisknuti tlacitka. Rucni opravu provedete v hodinove matici.
          </p>
        </div>

        <div class="manual-block">
          <h4>2. Vyber dne a hodinova matice</h4>
          <p>
            V horni casti vyberte datum. Aktualni den lze upravovat, historicke dny slouzi hlavne ke
            kontrole. V matici pouzivejte stavy <strong>D</strong>, <strong>ON</strong>,
            <strong>MID</strong>, <strong>OFF</strong> a <strong>S</strong>.
          </p>
        </div>

        <div class="manual-block">
          <h4>3. Denni zapis</h4>
          <p>
            Doplnte kvalitu spanku, celkovy dojem ze dne a kratkou poznamku. Tato cast je vhodna pro
            zachyceni souvislosti mezi priznaky, aktivitou a medikaci.
          </p>
        </div>

        <div class="manual-block">
          <h4>4. Lecba</h4>
          <p>
            Nejprve vytvorte pravidelny plan. Skutecne uzitou davku zapisujte pres rychly zapis.
            Sekce Lecba ukazuje, zda byla davka uzita vcas, drive, pozdeji, ceka na uziti nebo byla
            vynechana. Hodnoceni „vcas“ pouziva toleranci plus/minus 30 minut.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Pripomenuti leku</h4>
          <p>
            V Lecbe lze zapnout systemova upozorneni a zvolit pripomenuti v case davky nebo 5–30
            minut predem. Prohlizec musi mit povolene notifikace a aplikace musi byt otevrena nebo
            bezet na pozadi. Po uplnem ukonceni prohlizece zatim neni doruceni garantovano.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Casova osa, souhrn a trendy</h4>
          <p>
            Casova osa prepina mezi dny a jeji hodinova hlavicka zustava pri posunu viditelna.
            Souhrn ukazuje 7 a 30 dni. Trendy nabizeji 30–365 dni, pokryti dat a vyvoj ON/OFF.
            Vysledky jsou orientacni a nenahrazuji lekarske hodnoceni.
          </p>
        </div>

        <div class="manual-block">
          <h4>7. Synchronizace</h4>
          <p>
            Tlacitko <strong>Synchronizovat</strong> v hlavni liste provede nejprve pull a potom
            push. Po lokalni zmene se zobrazi „Zmeny cekaji na sync“ a aplikace kontroluje automaticky
            push jednou za minutu. Pri konfliktu se zaznamy slouci; smazane dny a davky maji mazaci
            znacky, aby se ze starsiho zarizeni nevratily.
          </p>
        </div>

        <div class="manual-block">
          <h4>8. Tisk reportu</h4>
          <p>
            Tlacitkem <strong>Print report</strong> otevrite tiskovy report pro lekare. Pred tiskem je
            vhodne zkontrolovat jmeno pacienta, rok narozeni a vybrany den.
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
            sync klic odpoji a musi se znovu obnovit.
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
