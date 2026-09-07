function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn = document.getElementById('mobileMenuBtn');
  menu.classList.toggle('open');
  btn.classList.toggle('open');
}  
// Scroll-reveal: sekcije se lagano pojave kad uđu u vidno polje
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target); // animira se samo jednom
      }
    });
  }, { threshold: 0.15 });

  revealElements.forEach(function(el) {
    revealObserver.observe(el);
  });

  // Logika za tabove (Usluge / Galerija / Cenovnik)
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      // Skini "active" klasu sa svih dugmadi i panela
      tabButtons.forEach(function(b) { b.classList.remove('active'); });
      tabPanels.forEach(function(p) { p.classList.remove('active'); });

      // Dodaj "active" na kliknuto dugme i odgovarajući panel
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

// Sav kod ispod se odnosi na formu za zakazivanje — postoji SAMO na zakazivanje.html,
  // pa prvo proveravamo da li forma uopšte postoji na ovoj stranici
  const bookingFormCheck = document.getElementById('bookingForm');
  if (bookingFormCheck) {
    const form = document.getElementById('bookingForm');
    const confirmationMsg = document.getElementById('confirmationMsg');
    const submitBtn = form.querySelector('.btn-submit');
    const datumInput = document.getElementById('datum');
    const vremeSelect = document.getElementById('vreme');

    // Ovde ide Web app URL iz Google Apps Script-a, iz NALOGA SALONA
    // (Extensions > Apps Script > Deploy > Web app -> kopiraj URL ovde)
    // Premešteno na vrh (bilo je niže) jer nam sad treba i ranije u fajlu
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbziU3JDJI1eDoy1NbJKYTI-_kO9yzcu-ql4o2cfiRkZHtMtNJD9Xj0e3P1hO7VqA9DG/exec';

    // Podrazumevano samo nedelja (0), dok se ne učita STVARNA lista sa
    // servera (podesivo kroz admin panel)
    let neradniDaniLista = [0];

    // Ne dozvoli biranje datuma u prošlosti
    datumInput.min = new Date().toISOString().split('T')[0];

    // Funkcija koja generiše opcije u padajućem meniju za vreme, na
    // osnovu STVARNIH podešavanja (radno vreme, jedna ili dve smene)
    function popuniTermine(pocetak, kraj, dvokratno, pocetak2, kraj2) {
      vremeSelect.innerHTML = '<option value="">-- Izaberite --</option>';

      const smene = [{ p: pocetak, k: kraj }];
      if (dvokratno) smene.push({ p: pocetak2, k: kraj2 });

      smene.forEach(function(smena) {
        for (let h = smena.p; h <= smena.k; h++) {
          for (let m = 0; m < 60; m += 30) {
            if (h === smena.k && m > 0) break;
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            const option = document.createElement('option');
            option.value = hh + ':' + mm;
            option.textContent = hh + ':' + mm;
            vremeSelect.appendChild(option);
          }
        }
      });
    }

    // Odmah popuni sa razumnim podrazumevanim vrednostima (08-20, jedna
    // smena), dok čekamo pravi odgovor sa servera — da meni ne bude prazan
    popuniTermine(8, 20, false);

    // Ograničenje koliko UNAPRED se sme zakazivati, i STVARNO radno vreme
    // (uključujući dvokratno, ako je podešeno) — pitamo skriptu, umesto
    // da te brojeve dupliramo na dva mesta (sajt i admin panel)
    var privremeniMaxDatum = new Date();
    privremeniMaxDatum.setMonth(privremeniMaxDatum.getMonth() + 2);
    datumInput.max = privremeniMaxDatum.toISOString().split('T')[0];

    fetch(SCRIPT_URL + '?action=javnaPodesavanja')
      .then(function(response) { return response.json(); })
      .then(function(data) {
        if (data.maxMeseciUnapred) {
          var maxDatum = new Date();
          maxDatum.setMonth(maxDatum.getMonth() + data.maxMeseciUnapred);
          datumInput.max = maxDatum.toISOString().split('T')[0];
        }
        if (data.radnoVremePocetak !== undefined) {
          popuniTermine(
            data.radnoVremePocetak,
            data.radnoVremeKraj,
            !!data.dvokratno,
            data.radnoVremePocetak2,
            data.radnoVremeKraj2
          );
        }
        if (data.neradniDani !== undefined) {
          neradniDaniLista = String(data.neradniDani).split(',').map(function(s) { return parseInt(s.trim(), 10); });
        }
      })
      .catch(function() {
        // Ako ovo ne uspe, ostaju podrazumevane vrednosti postavljene iznad
      });

    // Odmah upozori ako je izabran neradan dan (ne čekaj submit)
    datumInput.addEventListener('change', function() {
      const izabraniDan = new Date(datumInput.value + 'T00:00:00').getDay();
      if (neradniDaniLista.indexOf(izabraniDan) !== -1) {
        alert('Tog dana ne radimo. Izaberite drugi dan.');
        datumInput.value = '';
        return;
      }
      osveziDostupnostTermina();
    });

    const uslugaSelect = document.getElementById('usluga');
    uslugaSelect.addEventListener('change', osveziDostupnostTermina);

    // Proveri kod skripta koji su termini već zauzeti za izabrani datum+uslugu,
    // i "zasivi" (onemogući) ih u padajućem meniju za vreme
    function osveziDostupnostTermina() {
      const datum = datumInput.value;
      const usluga = uslugaSelect.value;
      if (!datum || !usluga) return;

      // Prvo vrati sve opcije u "dostupno" stanje
      Array.from(vremeSelect.options).forEach(function(opt) {
        if (opt.value) {
          opt.disabled = false;
          opt.textContent = opt.value;
        }
      });

      const url = SCRIPT_URL + '?datum=' + encodeURIComponent(datum) + '&usluga=' + encodeURIComponent(usluga);

      fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
          if (data.neradanDan) {
            // Ceo dan je neradan — zasivi SVE opcije, ne samo pojedinačne termine
            Array.from(vremeSelect.options).forEach(function(opt) {
              if (opt.value) {
                opt.disabled = true;
                opt.textContent = opt.value + ' (neradan dan)';
              }
            });
            return;
          }
          (data.zauzeto || []).forEach(function(vreme) {
            const opt = Array.from(vremeSelect.options).find(function(o) { return o.value === vreme; });
            if (opt) {
              opt.disabled = true;
              opt.textContent = vreme + ' (zauzeto)';
            }
          });
        })
        .catch(function(err) {
          console.log('Ne mogu da proverim dostupnost termina.', err);
        });
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();

      // Dvostruka provera neradnog dana pri slanju
      const datumVal = document.getElementById('datum').value;
      const izabraniDan = new Date(datumVal + 'T00:00:00').getDay();

      if (neradniDaniLista.indexOf(izabraniDan) !== -1) {
        alert('Tog dana ne radimo. Izaberite drugi dan.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Slanje...';

      const formData = new FormData(form);
      const klijentUneoEmail = !!document.getElementById('email').value;

      fetch(SCRIPT_URL, {
        method: 'POST',
        body: formData
        // BEZ mode: 'no-cors' — sad ČITAMO pravi odgovor skripte,
        // umesto da "šaljemo naslepo" i uvek prikazujemo "uspešno"
      })
        .then(function(response) { return response.json(); })
        .then(function(data) {

          if (data.result === 'Odbijeno (zauzeto)') {
            prikaziPoruku(
              'Nažalost, taj termin je upravo zauzet. Izaberite drugi termin ili nas pozovite telefonom.',
              'greska'
            );

          } else if (data.result === 'Odbijeno (predaleko)') {
            prikaziPoruku(
              'Nažalost, ne možemo zakazati termine toliko unapred. Izaberite bliži datum.',
              'greska'
            );

          } else if (data.result === 'Odbijeno (van radnog vremena)') {
            prikaziPoruku(
              'Izabrano vreme je van našeg radnog vremena. Izaberite drugo vreme.',
              'greska'
            );

          } else if (data.result === 'Na čekanju') {

            if (!data.mailVlasniku) {
              // Rezervacija je upisana, ali vlasnik NIJE obavešten —
              // klijent mora da zna da nešto proveri, ne da misli da je sve gotovo
              prikaziPoruku(
                'Vaš zahtev je zabeležen, ali nismo uspeli automatski da obavestimo salon. ' +
                'Molimo pozovite nas telefonom da potvrdite termin, ili pokušajte ponovo za par minuta.',
                'upozorenje'
              );

            } else if (klijentUneoEmail && !data.mailKlijentu) {
              prikaziPoruku(
                'Vaš zahtev je uspešno poslat salonu i čeka potvrdu! ' +
                'Nismo uspeli da vam pošaljemo mail potvrde — proverite email adresu, ili nas kontaktirajte ako ne dobijete odgovor uskoro.',
                'upozorenje'
              );

            } else {
              prikaziPoruku(
                'Hvala! Vaš zahtev je poslat — kontaktiraćemo vas uskoro za potvrdu.',
                'uspeh'
              );
            }

            form.reset();

          } else {
            prikaziPoruku(
              'Došlo je do greške pri slanju. Pokušajte ponovo ili nas pozovite telefonom.',
              'greska'
            );
          }
        })
        .catch(function() {
          prikaziPoruku(
            'Nismo uspeli da pošaljemo zahtev — proverite internet konekciju, ili nas kontaktirajte telefonom.',
            'greska'
          );
        })
        .finally(function() {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Potvrdi zakazivanje';
        });
    });

    // Prikazuje poruku i menja joj boju zavisno od tipa
    // ('uspeh' = zeleno, 'upozorenje' = žuto, 'greska' = crveno)
    function prikaziPoruku(tekst, tip) {
      confirmationMsg.textContent = tekst;
      confirmationMsg.className = 'confirmation ' + tip;
      confirmationMsg.style.display = 'block';
      confirmationMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
