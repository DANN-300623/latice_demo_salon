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

    // Ne dozvoli biranje datuma u prošlosti
    datumInput.min = new Date().toISOString().split('T')[0];

    // Ograničenje koliko UNAPRED se sme zakazivati — pitamo skriptu koji
    // je trenutni limit (podesivo kroz admin panel), umesto da taj broj
    // duplira na dva mesta. Dok se odgovor ne vrati, koristi se 2 meseca
    // kao razuman privremeni podrazumevani limit.
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
      })
      .catch(function() {
        // Ako ovo ne uspe, ostaje privremeni limit od 2 meseca postavljen iznad
      });

    // Popuni padajući meni terminima na svakih 30 minuta, 08:00-20:00
    (function populateTimeSlots() {
      const startHour = 8;
      const endHour = 20;
      for (let h = startHour; h <= endHour; h++) {
        for (let m = 0; m < 60; m += 30) {
          if (h === endHour && m > 0) break; // ne ide posle 20:00
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          const option = document.createElement('option');
          option.value = hh + ':' + mm;
          option.textContent = hh + ':' + mm;
          vremeSelect.appendChild(option);
        }
      }
    })();

    // Odmah upozori ako je izabrana nedelja (ne čekaj submit)
    datumInput.addEventListener('change', function() {
      const izabraniDan = new Date(datumInput.value + 'T00:00:00').getDay();
      if (izabraniDan === 0) {
        alert('Nedeljom ne radimo. Izaberite drugi dan.');
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

      // Dvostruka provera nedelje pri slanju
      const datumVal = document.getElementById('datum').value;
      const izabraniDan = new Date(datumVal + 'T00:00:00').getDay();

      if (izabraniDan === 0) {
        alert('Nedeljom ne radimo. Izaberite drugi dan.');
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
