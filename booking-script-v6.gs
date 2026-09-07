// ============================================================
// PODEŠAVANJE
// ============================================================
var OWNER_EMAIL = 'dann.standard@gmail.com';

// PROMENI OVDE: lozinka za pristup admin panelu (mali HTML fajl za vlasnika)
var ADMIN_LOZINKA = 'latice2026';

// Trajanje termina po usluzi (u minutima) — ovde podešavaš koliko koja
// usluga traje, uticaj na to koliko blokira mesta u kalendaru
var TRAJANJE_USLUGE = {
  'Nega lica': 60,
  'Masaža tela': 60,
  'Manikir & Pedikir': 45
};

function trajanjeZaUslugu(usluga) {
  return TRAJANJE_USLUGE[usluga] || 60; // podrazumevano 60 min ako usluga nije na listi
}

function pad(n) {
  return String(n).padStart(2, '0');
}


// ============================================================
// PODEŠAVANJA KOJA VLASNIK MOŽE DA MENJA KROZ ADMIN PANEL
// (radno vreme, koliko meseci unapred se može zakazati) — čuvaju se
// u posebnom tabu tabele zvanom "Podešavanja", ne u samom kodu, da
// bi vlasnik mogao da ih menja BEZ ulaska u Apps Script
// ============================================================
function ucitajPodesavanja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Podešavanja');
  var podrazumevano = {
    RADNO_VREME_POCETAK: 8,
    RADNO_VREME_KRAJ: 20,
    MAX_MESECI_UNAPRED: 2
  };

  // Prvi put — napravi tab sa podrazumevanim vrednostima
  if (!sheet) {
    sheet = ss.insertSheet('Podešavanja');
    sheet.appendRow(['Podešavanje', 'Vrednost']);
    sheet.appendRow(['RADNO_VREME_POCETAK', podrazumevano.RADNO_VREME_POCETAK]);
    sheet.appendRow(['RADNO_VREME_KRAJ', podrazumevano.RADNO_VREME_KRAJ]);
    sheet.appendRow(['MAX_MESECI_UNAPRED', podrazumevano.MAX_MESECI_UNAPRED]);
    return podrazumevano;
  }

  var podaci = sheet.getDataRange().getValues();
  var mapa = {};
  for (var i = 1; i < podaci.length; i++) {
    mapa[podaci[i][0]] = podaci[i][1];
  }
  return {
    RADNO_VREME_POCETAK: Number(mapa.RADNO_VREME_POCETAK) || podrazumevano.RADNO_VREME_POCETAK,
    RADNO_VREME_KRAJ: Number(mapa.RADNO_VREME_KRAJ) || podrazumevano.RADNO_VREME_KRAJ,
    MAX_MESECI_UNAPRED: Number(mapa.MAX_MESECI_UNAPRED) || podrazumevano.MAX_MESECI_UNAPRED
  };
}

function sacuvajPodesavanja(pocetak, kraj, mesUnapred) {
  ucitajPodesavanja(); // garantuje da tab "Podešavanja" postoji
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Podešavanja');
  var podaci = sheet.getDataRange().getValues();
  for (var i = 1; i < podaci.length; i++) {
    if (podaci[i][0] === 'RADNO_VREME_POCETAK') sheet.getRange(i + 1, 2).setValue(pocetak);
    if (podaci[i][0] === 'RADNO_VREME_KRAJ') sheet.getRange(i + 1, 2).setValue(kraj);
    if (podaci[i][0] === 'MAX_MESECI_UNAPRED') sheet.getRange(i + 1, 2).setValue(mesUnapred);
  }
}


// ============================================================
// JEDNOKRATNO POKRETANJE — da "otključa" dozvolu za mail (isto kao ranije)
// ============================================================

// Pomoćna funkcija — "umotava" HTML odgovor i eksplicitno dozvoljava da se
// prikaže unutar Gmail-ovog internog pregledača (bez ovoga, klik na link
// iz mail-a na telefonu ponekad javlja "refused to connect")
function htmlOdgovor(sadrzaj) {
  return HtmlService.createHtmlOutput(sadrzaj)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function odobriMailDozvolu() {
  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: 'Test — dozvola za slanje mailova',
    body: 'Ako vidiš ovaj mail, dozvola za slanje je uspešno odobrena.'
  });
  Logger.log('Test mail poslat na: ' + OWNER_EMAIL);
}


// ============================================================
// doPost — poziva ga sajt kad neko POŠALJE formu za zakazivanje
// ============================================================
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Vreme prijave', 'Ime i prezime', 'Broj telefona', 'Email',
      'Usluga', 'Datum', 'Vreme termina', 'Status', 'Event ID',
      'Predloženi datum', 'Predloženo vreme', 'Napomena'
    ]);
  }

  var ime = e.parameter['Ime i prezime'];
  var telefon = e.parameter['Broj telefona'];
  var email = e.parameter['Email'] || '';
  var usluga = e.parameter['Usluga'];
  var datum = e.parameter['Datum'];
  var vreme = e.parameter['Vreme'];

  var novRed = sheet.getLastRow() + 1;
  var status = '';
  var eventId = '';
  var napomena = '';

  var trajanjeMin = trajanjeZaUslugu(usluga);
  var startDateTime = new Date(datum + 'T' + vreme + ':00');
  var endDateTime = new Date(startDateTime.getTime() + trajanjeMin * 60000);

  // --- Provera "prozora zakazivanja" — koliko UNAPRED sme da se zakazuje
  // (ovo je DODATNA zaštita na serveru; sajt već sprečava biranje daljih
  // datuma preko max atributa, ali ovo hvata i slučaj da neko zaobiđe sajt)
  var podesavanjaZaProveru = ucitajPodesavanja();
  var najdaljiDozvoljeniDatum = new Date();
  najdaljiDozvoljeniDatum.setMonth(najdaljiDozvoljeniDatum.getMonth() + podesavanjaZaProveru.MAX_MESECI_UNAPRED);

  if (startDateTime > najdaljiDozvoljeniDatum) {
    sheet.appendRow([new Date(), ime, telefon, email, usluga, datum, vreme, 'Odbijeno (predaleko)', '', '', '', 'Termin je van dozvoljenog perioda zakazivanja.']);
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'Odbijeno (predaleko)', mailVlasniku: false, mailKlijentu: null }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- Proveri da li je termin slobodan
  try {
    var kalendar = CalendarApp.getDefaultCalendar();
    var postojeciDogadjaji = kalendar.getEvents(startDateTime, endDateTime);

    if (postojeciDogadjaji.length > 0) {
      status = 'Odbijeno (zauzeto)';
      napomena = 'Termin je već bio zauzet u trenutku slanja.';
    } else {
      // Napravi "rezervisano mesto" u kalendaru dok čeka odobrenje —
      // ovo sprečava da neko drugi zakaže isti termin u međuvremenu,
      // ali NIKOGA ne pozivamo još (nema guest-a, nema pozivnice)
      var dogadjaj = kalendar.createEvent(
        '[NA ČEKANJU] ' + vreme + ' — ' + usluga + ' — ' + ime,
        startDateTime,
        endDateTime,
        { description: 'Telefon: ' + telefon + (email ? '\nEmail: ' + email : '') + '\nRed u tabeli: ' + novRed }
      );
      eventId = dogadjaj.getId();
      status = 'Na čekanju';
    }
  } catch (greska) {
    status = 'GREŠKA';
    napomena = 'GREŠKA KALENDARA: ' + greska.message;
  }

  sheet.appendRow([new Date(), ime, telefon, email, usluga, datum, vreme, status, eventId, '', '', napomena]);

  // Pratimo USPEH svakog maila posebno — sajt na osnovu ovoga prikazuje
  // klijentu TAČNU poruku umesto uvek istog "uspešno"
  var mailVlasnikuUspeo = false;
  var mailKlijentuUspeo = null; // null = klijent nije ni uneo email

  // --- Ako je na čekanju, pošalji mailove (vlasniku sa dugmićima, klijentu sa statusom)
  if (status === 'Na čekanju') {
    try {
      var scriptUrl = ScriptApp.getService().getUrl();
      var linkPotvrdi = scriptUrl + '?action=potvrdi&red=' + novRed;
      var linkOdbij = scriptUrl + '?action=odbij&red=' + novRed;
      var linkPredlozi = scriptUrl + '?action=predlozi&red=' + novRed;

      MailApp.sendEmail({
        to: OWNER_EMAIL,
        subject: 'Zahtev za termin — ' + ime + ' (' + datum + ' ' + vreme + ')',
        htmlBody:
          'Novi zahtev za termin:<br><br>' +
          'Ime: ' + ime + '<br>' +
          'Telefon: ' + telefon + '<br>' +
          'Email: ' + (email || '-') + '<br>' +
          'Usluga: ' + usluga + '<br>' +
          'Datum: ' + datum + '<br>' +
          'Vreme: ' + vreme + '<br><br>' +
          '<a href="' + linkPotvrdi + '" style="background:#2e7d32;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-family:sans-serif;">✅ Potvrdi termin</a>' +
          '&nbsp;&nbsp;' +
          '<a href="' + linkPredlozi + '" style="background:#9C7B44;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-family:sans-serif;">🕓 Predloži drugo vreme</a>' +
          '&nbsp;&nbsp;' +
          '<a href="' + linkOdbij + '" style="background:#c62828;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-family:sans-serif;">❌ Odbij termin</a>'
      });
      mailVlasnikuUspeo = true;
    } catch (greskaMail) {
      // NE prekidamo izvršavanje — rezervacija je već upisana u tabeli,
      // samo mail vlasniku nije uspeo
      napomena += ' MAIL VLASNIKU NIJE USPEO: ' + greskaMail.message;
    }

    if (email) {
      mailKlijentuUspeo = false;
      try {
        MailApp.sendEmail({
          to: email,
          subject: 'Zahtev za termin primljen — Latice',
          body: 'Zdravo ' + ime + ',\n\n' +
                'Vaš zahtev za termin (' + usluga + ', ' + datum + ' u ' + vreme + ') je primljen i čeka potvrdu.\n' +
                'Javićemo vam se uskoro sa potvrdom.\n\nLatice'
        });
        mailKlijentuUspeo = true;
      } catch (greskaMail2) {
        napomena += ' MAIL KLIJENTU NIJE USPEO: ' + greskaMail2.message;
      }
    }
  }

  sheet.getRange(novRed, 12).setValue(napomena); // kolona "Napomena" je sad 12., zbog dve nove kolone za predlog termina

  return ContentService
    .createTextOutput(JSON.stringify({
      result: status,
      mailVlasniku: mailVlasnikuUspeo,
      mailKlijentu: mailKlijentuUspeo
    }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// doGet — ima DVE namene, u zavisnosti od parametara u linku:
//   1. Sajt ga poziva da proveri koji su termini zauzeti (parametar "datum")
//   2. Vlasnik ga poziva klikom na dugme u mailu (parametar "action")
// ============================================================
function doGet(e) {
  if (e.parameter.action === 'javnaPodesavanja') {
    return javnaPodesavanja(e);
  }
  if (e.parameter.action === 'potvrdi' || e.parameter.action === 'odbij') {
    return obradiPotvrduIliOdbijanje(e);
  }
  if (e.parameter.action === 'predlozi') {
    return prikaziFormuZaPredlog(e);
  }
  if (e.parameter.action === 'posaljiPredlog') {
    return posaljiPredlogKlijentu(e);
  }
  if (e.parameter.action === 'klijentPotvrdi' || e.parameter.action === 'klijentOdbij') {
    return obradiOdlukuKlijenta(e);
  }
  if (e.parameter.action === 'adminPodaci') {
    return adminVratiPodatke(e);
  }
  if (e.parameter.action === 'adminSacuvaj') {
    return adminSacuvajPodesavanja(e);
  }
  if (e.parameter.datum) {
    return proveriDostupnost(e);
  }
  return htmlOdgovor('Nepoznat zahtev.');
}

// ============================================================
// ADMIN PANEL — podaci za mali HTML fajl koji vlasnik otvara posebno
// (vidi admin.html). Zaštićeno lozinkom (ADMIN_LOZINKA na vrhu fajla).
// ============================================================

function adminVratiPodatke(e) {
  if (e.parameter.lozinka !== ADMIN_LOZINKA) {
    return ContentService.createTextOutput(JSON.stringify({ greska: 'Pogrešna lozinka' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var podesavanja = ucitajPodesavanja();

  // Pokupi sve rezervacije iz glavnog taba (osim naslova) da bi admin
  // panel mogao da ih prikaže na kalendaru
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var poslednjiRed = sheet.getLastRow();
  var rezervacije = [];

  if (poslednjiRed > 1) {
    var podaci = sheet.getRange(2, 1, poslednjiRed - 1, 12).getValues();
    podaci.forEach(function(red) {
      var datum = red[5];
      var vreme = red[6];
      if (!datum) return; // preskoči prazne redove
      rezervacije.push({
        ime: red[1],
        telefon: red[2],
        usluga: red[4],
        datum: (datum instanceof Date) ? Utilities.formatDate(datum, Session.getScriptTimeZone(), 'yyyy-MM-dd') : datum,
        vreme: vreme,
        status: red[7]
      });
    });
  }

  var output = ContentService.createTextOutput(JSON.stringify({
    podesavanja: podesavanja,
    rezervacije: rezervacije
  }));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function adminSacuvajPodesavanja(e) {
  if (e.parameter.lozinka !== ADMIN_LOZINKA) {
    return ContentService.createTextOutput(JSON.stringify({ greska: 'Pogrešna lozinka' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var pocetak = parseInt(e.parameter.pocetak, 10);
  var kraj = parseInt(e.parameter.kraj, 10);
  var mesUnapred = parseInt(e.parameter.mesUnapred, 10);

  sacuvajPodesavanja(pocetak, kraj, mesUnapred);

  var output = ContentService.createTextOutput(JSON.stringify({ uspeh: true }));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// --- Javno dostupno (bez lozinke) — sajt ovo pita da zna do kad sme
// da ponudi datume, bez da dupliramo taj broj na dva mesta
function javnaPodesavanja(e) {
  var podesavanja = ucitajPodesavanja();
  var output = ContentService.createTextOutput(JSON.stringify({
    maxMeseciUnapred: podesavanja.MAX_MESECI_UNAPRED
  }));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// --- Provera dostupnosti termina za dati datum + uslugu (za sajt)
function proveriDostupnost(e) {
  var datum = e.parameter.datum;
  var usluga = e.parameter.usluga || '';
  var trajanjeMin = trajanjeZaUslugu(usluga);
  var podesavanja = ucitajPodesavanja();

  var kalendar = CalendarApp.getDefaultCalendar();
  var pocetakDana = new Date(datum + 'T00:00:00');
  var krajDana = new Date(datum + 'T23:59:59');
  var dogadjaji = kalendar.getEvents(pocetakDana, krajDana);

  var zauzetiSlotovi = [];
  var startHour = podesavanja.RADNO_VREME_POCETAK, endHour = podesavanja.RADNO_VREME_KRAJ;

  for (var h = startHour; h <= endHour; h++) {
    for (var m = 0; m < 60; m += 30) {
      if (h === endHour && m > 0) break;
      var slotStart = new Date(datum + 'T' + pad(h) + ':' + pad(m) + ':00');
      var slotEnd = new Date(slotStart.getTime() + trajanjeMin * 60000);

      var zauzet = dogadjaji.some(function(dogadjaj) {
        return slotStart < dogadjaj.getEndTime() && dogadjaj.getStartTime() < slotEnd;
      });

      if (zauzet) {
        zauzetiSlotovi.push(pad(h) + ':' + pad(m));
      }
    }
  }

  var output = ContentService.createTextOutput(JSON.stringify({ zauzeto: zauzetiSlotovi }));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// --- Obrada klika na "Potvrdi" ili "Odbij" iz mail-a (za vlasnika)
function obradiPotvrduIliOdbijanje(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var red = parseInt(e.parameter.red, 10);
  var action = e.parameter.action;

  if (!red || red < 2) {
    return htmlOdgovor('Nevažeći zahtev.');
  }

  var vrednosti = sheet.getRange(red, 1, 1, 12).getValues()[0];
  var ime = vrednosti[1];
  var email = vrednosti[3];
  var usluga = vrednosti[4];
  var datum = vrednosti[5];
  var vreme = vrednosti[6];
  var trenutniStatus = vrednosti[7];
  var eventId = vrednosti[8];

  if (trenutniStatus !== 'Na čekanju') {
    return htmlOdgovor('<h2>Ovaj zahtev je već obrađen</h2><p>Status: ' + trenutniStatus + '</p>');
  }

  var kalendar = CalendarApp.getDefaultCalendar();
  var dogadjaj = eventId ? kalendar.getEventById(eventId) : null;

  if (action === 'potvrdi') {
    if (dogadjaj) {
      dogadjaj.setTitle(vreme + ' — ' + usluga + ' — ' + ime);
      if (email) {
        dogadjaj.addGuest(email); // ovo šalje pravu kalendarsku pozivnicu klijentu
      }
    }
    sheet.getRange(red, 8).setValue('Potvrđeno');

    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: 'Termin potvrđen — Latice',
        body: 'Zdravo ' + ime + ',\n\nVaš termin (' + usluga + ', ' + datum + ' u ' + vreme + ') je potvrđen. Vidimo se!\n\nLatice'
      });
    }
    return htmlOdgovor('<h2>Termin potvrđen ✅</h2><p>' + ime + ' — ' + datum + ' u ' + vreme + '</p>');
  }

  if (action === 'odbij') {
    if (dogadjaj) {
      dogadjaj.deleteEvent();
    }
    sheet.getRange(red, 8).setValue('Odbijeno');

    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: 'Termin nije dostupan — Latice',
        body: 'Zdravo ' + ime + ',\n\nNažalost, termin (' + usluga + ', ' + datum + ' u ' + vreme + ') nije dostupan. Kontaktirajte nas za drugi termin.\n\nLatice'
      });
    }
    return htmlOdgovor('<h2>Termin odbijen ❌</h2><p>' + ime + ' — ' + datum + ' u ' + vreme + '</p>');
  }

  return htmlOdgovor('Nepoznata akcija.');
}


// ============================================================
// TREĆE DUGME — "Predloži drugo vreme"
// ============================================================

// --- Klik na "🕓 Predloži drugo vreme" u mailu vlasniku — prikaže malu
// formu (datum + vreme) direktno u browseru, bez ulaska u tabelu/kod
function prikaziFormuZaPredlog(e) {
  var red = e.parameter.red;
  var scriptUrl = ScriptApp.getService().getUrl();
  var html =
    '<html><body style="font-family:sans-serif; max-width:400px; margin:40px auto;">' +
    '<h2>Predloži drugo vreme</h2>' +
    '<form action="' + scriptUrl + '" method="get">' +
    '<input type="hidden" name="action" value="posaljiPredlog">' +
    '<input type="hidden" name="red" value="' + red + '">' +
    '<label>Novi datum:<br><input type="date" name="noviDatum" required style="padding:8px; width:100%; margin:8px 0;"></label><br>' +
    '<label>Novo vreme:<br><input type="time" name="noviVreme" required style="padding:8px; width:100%; margin:8px 0;"></label><br>' +
    '<button type="submit" style="background:#9C7B44; color:white; padding:12px 24px; border:none; border-radius:6px; margin-top:12px;">Pošalji predlog klijentu</button>' +
    '</form></body></html>';
  return htmlOdgovor(html);
}

// --- Vlasnik je popunio formu iznad — upisuje predlog u tabelu i šalje
// klijentu mail sa predloženim terminom i njegovim dugmadima da odluči
function posaljiPredlogKlijentu(e) {
  var red = parseInt(e.parameter.red, 10);
  var noviDatum = e.parameter.noviDatum;
  var noviVreme = e.parameter.noviVreme;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  var vrednosti = sheet.getRange(red, 1, 1, 12).getValues()[0];
  var ime = vrednosti[1];
  var email = vrednosti[3];
  var usluga = vrednosti[4];

  sheet.getRange(red, 8).setValue('Čeka odgovor klijenta na predlog'); // kolona Status
  sheet.getRange(red, 10).setValue(noviDatum);  // kolona Predloženi datum
  sheet.getRange(red, 11).setValue(noviVreme);  // kolona Predloženo vreme

  if (email) {
    var scriptUrl = ScriptApp.getService().getUrl();
    var linkDa = scriptUrl + '?action=klijentPotvrdi&red=' + red;
    var linkNe = scriptUrl + '?action=klijentOdbij&red=' + red;

    MailApp.sendEmail({
      to: email,
      subject: 'Predlog novog termina — Latice',
      htmlBody:
        'Zdravo ' + ime + ',<br><br>' +
        'Termin koji ste tražili nije bio dostupan, ali predlažemo:<br>' +
        '<b>' + noviDatum + ' u ' + noviVreme + '</b><br><br>' +
        '<a href="' + linkDa + '" style="background:#2e7d32;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;">✅ Prihvatam</a>&nbsp;' +
        '<a href="' + linkNe + '" style="background:#c62828;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;">❌ Ne odgovara mi</a>'
    });
  }

  return htmlOdgovor('<h2>Predlog poslat klijentu ✅</h2><p>Sad čekamo njegov odgovor.</p>');
}

// --- Klijent klikne "Prihvatam" ili "Ne odgovara mi" iz svog mail-a
function obradiOdlukuKlijenta(e) {
  var red = parseInt(e.parameter.red, 10);
  var action = e.parameter.action;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  var vrednosti = sheet.getRange(red, 1, 1, 12).getValues()[0];
  var ime = vrednosti[1];
  var email = vrednosti[3];
  var usluga = vrednosti[4];
  var noviDatum = vrednosti[9];
  var noviVreme = vrednosti[10];

  if (action === 'klijentPotvrdi') {
    var trajanjeMin = trajanjeZaUslugu(usluga);
    var startDateTime = new Date(noviDatum + 'T' + noviVreme + ':00');
    var endDateTime = new Date(startDateTime.getTime() + trajanjeMin * 60000);
    var kalendar = CalendarApp.getDefaultCalendar();

    var dogadjaj = kalendar.createEvent(
      noviVreme + ' — ' + usluga + ' — ' + ime,
      startDateTime,
      endDateTime,
      { guests: email, sendInvites: true }
    );

    sheet.getRange(red, 8).setValue('Potvrđeno (novi termin)');
    sheet.getRange(red, 6).setValue(noviDatum); // ažuriraj i glavnu kolonu Datum
    sheet.getRange(red, 7).setValue(noviVreme); // ažuriraj i glavnu kolonu Vreme
    sheet.getRange(red, 9).setValue(dogadjaj.getId());

    // Obavesti VLASNIKA da je klijent prihvatio predloženi termin
    try {
      MailApp.sendEmail({
        to: OWNER_EMAIL,
        subject: '✅ Klijent prihvatio predloženi termin — ' + ime,
        body: ime + ' je prihvatio/la predloženi termin:\n\n' +
              'Usluga: ' + usluga + '\n' +
              'Datum: ' + noviDatum + '\n' +
              'Vreme: ' + noviVreme + '\n\n' +
              'Termin je automatski dodat u kalendar.'
      });
    } catch (greskaMail3) {}

    return htmlOdgovor('<h2>Novi termin potvrđen ✅</h2><p>' + noviDatum + ' u ' + noviVreme + '</p>');
  }

  if (action === 'klijentOdbij') {
    sheet.getRange(red, 8).setValue('Klijent odbio predlog');

    // Obavesti VLASNIKA da klijentu predloženi termin ne odgovara
    try {
      MailApp.sendEmail({
        to: OWNER_EMAIL,
        subject: '❌ Klijent odbio predloženi termin — ' + ime,
        body: ime + ' (' + usluga + ') nije prihvatio/la predloženi termin (' + noviDatum + ' u ' + noviVreme + ').\n\n' +
              'Preporučuje se da ga/je kontaktirate telefonom za dogovor oko drugog termina.'
      });
    } catch (greskaMail4) {}

    return htmlOdgovor(
      '<div style="font-family:sans-serif; max-width:420px; margin:40px auto; text-align:center;">' +
      '<h2>U redu, hvala na odgovoru.</h2>' +
      '<p>Ukoliko vam ne odgovara predloženi termin, molimo vas da probate da zakažete drugi ili da nas kontaktirate telefonom.</p>' +
      '</div>'
    );
  }

  return htmlOdgovor('Nepoznata akcija.');
}
