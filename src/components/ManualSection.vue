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
          <h4>1. Vyber dne</h4>
          <p>
            V horni casti aplikace vyberte datum. Pro aktualni den lze zaznamy upravovat, pro starsi
            dny jsou hodinove stavy urcene hlavne ke cteni a kontrole historie.
          </p>
        </div>

        <div class="manual-block">
          <h4>2. Hodinova matice</h4>
          <p>
            V sekci <strong>Hodinova matice</strong> zapisujte stav pro jednotlive hodiny. Barvy a
            zkratky odpovidaji stavum <strong>D</strong>, <strong>ON</strong>, <strong>MID</strong>,
            <strong>OFF</strong> a <strong>S</strong>.
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
            V sekci <strong>Lecba</strong> pridejte skutecne uzite davky. Cas a davka se projevi i v
            tiskovem reportu, pokud je aplikace podporuje v aktualni verzi.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Casova osa a souhrn</h4>
          <p>
            Casova osa slouzi k rychlemu prepinani mezi dny. Souhrn nabizi orientacni statistiky za
            dnes, 7 dni a 30 dni. Tyto statistiky jsou informativni a nenahrazuji lekarske hodnoceni.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Tisk reportu</h4>
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
          <h4>3. Reset demo dat</h4>
          <p>
            Tlacitko <strong>Reset demo data</strong> obnovi simulovana testovaci data. Tento krok je
            vhodny pro demonstrace, ale nemel by se pouzivat nad realnymi pacientskymi zaznamy bez
            predchozi zalohy.
          </p>
        </div>

        <div class="manual-block">
          <h4>4. Doporuceny provoz</h4>
          <p>
            Pred aktualizaci aplikace nebo testovanim nove verze vytvorte export databaze. Pri
            sdileni reportu kontrolujte, zda neobsahuje vice osobnich udaju, nez je potreba.
          </p>
        </div>

        <div class="manual-block">
          <h4>5. Omezeni prototypu</h4>
          <p>
            Soucasna verze je prototyp. Klinicka interpretace statistik, dlouhodobych trendu a
            reportovych metrik musi byt overena se specializovanym lekarem.
          </p>
        </div>

        <div class="manual-block">
          <h4>6. Budouci sprava</h4>
          <p>
            Roadmapa pocita s JSON exportem, cloudovymi zalohami, pravidly kvality dat a oddelenim
            uzivatelske a spravcovske role. Tato cast muze byt pozdeji rozsirená do samostatne
            napovedy nebo dokumentace.
          </p>
        </div>
      </article>
    </div>
  </section>
</template>
