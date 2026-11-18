import type { Language } from "@/data/types";

/**
 * The words on the site phone view, in each language the crew speaks. In the live product a
 * model translates site instructions and notes as they are written; in the demo the
 * translations below are fixed, one for each site a speaker of that language is working on.
 */
type Words = {
  today: string; start: string; manager: string; call: string; instructions: string; translated: string; original: string; mine: string;
  photo: string; extra: string; ask: string; week: string; noSite: string; caption: string; send: string; cancel: string;
  found: string; note: string; people: string; ownPlant: string; hirePlant: string; need: string; what: string;
  photoSent: string; extraSent: string; askSent: string; free: string; leave: string; half: string; takeOrChoose: string;
  /** Compliance on the phone (18 Nov): my tickets, a photo of a new card, and the van I drive. Not yet read by a native speaker. */
  myTickets: string; ranOut: string; runsOut: string; cannotWork: string; sendCard: string; cardSent: string; cardWaiting: string; van: string; doNotDrive: string; dueBy: string; booked: string;
};

export const WORDS: Record<Language, Words> = {
  en: {
    today: "Today", start: "Start 08:00", manager: "Site manager", call: "Call", instructions: "Site instructions", translated: "Translated from English for you", original: "Show the English original", mine: "Show it in my language",
    photo: "Send a photo", extra: "Report extra work", ask: "Ask for something", week: "My week", noSite: "You are not down for a site today. Ring the office if that is wrong.", caption: "What does the photo show?", send: "Send", cancel: "Cancel",
    found: "What did you find?", note: "Anything to add (optional)", people: "More people", ownPlant: "Our own plant or tools", hirePlant: "Something to hire", need: "What do you need?", what: "Describe it",
    photoSent: "Photo sent. It is in the project's photos", extraSent: "Sent to the office. Nothing extra is done until it is approved", askSent: "Request sent to the office", free: "Free", leave: "Leave", half: "half day", takeOrChoose: "Take a photo or choose one first",
    myTickets: "My tickets", ranOut: "ran out", runsOut: "runs out", cannotWork: "You cannot work on site until it is renewed. Ring the office.", sendCard: "Send a photo of the new card", cardSent: "Sent. The office will check it and update your ticket", cardWaiting: "Sent to the office, waiting to be checked", van: "Your van", doNotDrive: "Do not drive it until the office renews it.", dueBy: "due", booked: "Booked on the course",
  },
  pl: {
    today: "Dziś", start: "Początek 08:00", manager: "Kierownik budowy", call: "Zadzwoń", instructions: "Instrukcje na budowie", translated: "Przetłumaczone dla Ciebie z angielskiego", original: "Pokaż oryginał po angielsku", mine: "Pokaż w moim języku",
    photo: "Wyślij zdjęcie", extra: "Zgłoś dodatkową pracę", ask: "Poproś o coś", week: "Mój tydzień", noSite: "Nie masz dziś przypisanej budowy. Zadzwoń do biura, jeśli to błąd.", caption: "Co pokazuje zdjęcie?", send: "Wyślij", cancel: "Anuluj",
    found: "Co znalazłeś?", note: "Coś do dodania (opcjonalnie)", people: "Więcej ludzi", ownPlant: "Nasz sprzęt lub narzędzia", hirePlant: "Coś do wynajęcia", need: "Czego potrzebujesz?", what: "Opisz",
    photoSent: "Zdjęcie wysłane. Jest w zdjęciach projektu", extraSent: "Wysłano do biura. Dodatkowej pracy nie wykonujemy bez zatwierdzenia", askSent: "Prośba wysłana do biura", free: "Wolne", leave: "Urlop", half: "pół dnia", takeOrChoose: "Najpierw zrób lub wybierz zdjęcie",
    myTickets: "Moje uprawnienia", ranOut: "wygasło", runsOut: "ważne do", cannotWork: "Nie możesz pracować na budowie, dopóki nie zostanie odnowione. Zadzwoń do biura.", sendCard: "Wyślij zdjęcie nowej karty", cardSent: "Wysłano. Biuro sprawdzi i zaktualizuje uprawnienie", cardWaiting: "Wysłane do biura, czeka na sprawdzenie", van: "Twój samochód", doNotDrive: "Nie jeździj nim, dopóki biuro tego nie odnowi.", dueBy: "termin", booked: "Zapisany na kurs",
  },
  ro: {
    today: "Azi", start: "Început 08:00", manager: "Șef de șantier", call: "Sună", instructions: "Instrucțiuni de șantier", translated: "Tradus pentru tine din engleză", original: "Arată originalul în engleză", mine: "Arată în limba mea",
    photo: "Trimite o fotografie", extra: "Raportează lucrări suplimentare", ask: "Cere ceva", week: "Săptămâna mea", noSite: "Nu ești trecut pe niciun șantier azi. Sună la birou dacă e o greșeală.", caption: "Ce arată fotografia?", send: "Trimite", cancel: "Anulează",
    found: "Ce ai găsit?", note: "Ceva de adăugat (opțional)", people: "Mai mulți oameni", ownPlant: "Utilajele sau sculele noastre", hirePlant: "Ceva de închiriat", need: "De ce ai nevoie?", what: "Descrie",
    photoSent: "Fotografie trimisă. Este în fotografiile proiectului", extraSent: "Trimis la birou. Nu se lucrează suplimentar până nu se aprobă", askSent: "Cererea a fost trimisă la birou", free: "Liber", leave: "Concediu", half: "jumătate de zi", takeOrChoose: "Fă sau alege mai întâi o fotografie",
    myTickets: "Certificatele mele", ranOut: "a expirat", runsOut: "valabil până la", cannotWork: "Nu poți lucra pe șantier până nu este reînnoit. Sună la birou.", sendCard: "Trimite o fotografie a noului card", cardSent: "Trimis. Biroul îl verifică și îți actualizează certificatul", cardWaiting: "Trimis la birou, așteaptă verificarea", van: "Duba ta", doNotDrive: "Nu o conduce până nu reînnoiește biroul actele.", dueBy: "scadent", booked: "Înscris la curs",
  },
  pt: {
    today: "Hoje", start: "Início 08:00", manager: "Encarregado de obra", call: "Ligar", instructions: "Instruções da obra", translated: "Traduzido do inglês para si", original: "Mostrar o original em inglês", mine: "Mostrar na minha língua",
    photo: "Enviar uma foto", extra: "Comunicar trabalho extra", ask: "Pedir alguma coisa", week: "A minha semana", noSite: "Não tem obra atribuída hoje. Ligue para o escritório se estiver errado.", caption: "O que mostra a foto?", send: "Enviar", cancel: "Cancelar",
    found: "O que encontrou?", note: "Algo a acrescentar (opcional)", people: "Mais pessoas", ownPlant: "Equipamento ou ferramentas nossas", hirePlant: "Algo para alugar", need: "De que precisa?", what: "Descreva",
    photoSent: "Foto enviada. Está nas fotos do projeto", extraSent: "Enviado para o escritório. Nada extra é feito sem aprovação", askSent: "Pedido enviado para o escritório", free: "Livre", leave: "Férias", half: "meio dia", takeOrChoose: "Tire ou escolha primeiro uma foto",
    myTickets: "Os meus certificados", ranOut: "expirou", runsOut: "válido até", cannotWork: "Não pode trabalhar na obra até ser renovado. Ligue para o escritório.", sendCard: "Enviar uma foto do novo cartão", cardSent: "Enviado. O escritório vai verificar e atualizar o seu certificado", cardWaiting: "Enviado para o escritório, à espera de verificação", van: "A sua carrinha", doNotDrive: "Não a conduza até o escritório renovar.", dueBy: "vence", booked: "Inscrito no curso",
  },
  lt: {
    today: "Šiandien", start: "Pradžia 08:00", manager: "Statybos vadovas", call: "Skambinti", instructions: "Nurodymai objekte", translated: "Išversta jums iš anglų kalbos", original: "Rodyti originalą anglų kalba", mine: "Rodyti mano kalba",
    photo: "Siųsti nuotrauką", extra: "Pranešti apie papildomą darbą", ask: "Paprašyti", week: "Mano savaitė", noSite: "Šiandien jums nepriskirtas objektas. Jei tai klaida, paskambinkite į biurą.", caption: "Kas matyti nuotraukoje?", send: "Siųsti", cancel: "Atšaukti",
    found: "Ką radote?", note: "Ką nors pridėti (neprivaloma)", people: "Daugiau žmonių", ownPlant: "Mūsų technika ar įrankiai", hirePlant: "Ką nors išsinuomoti", need: "Ko jums reikia?", what: "Aprašykite",
    photoSent: "Nuotrauka išsiųsta. Ji yra projekto nuotraukose", extraSent: "Išsiųsta į biurą. Papildomas darbas nedaromas, kol nepatvirtinta", askSent: "Prašymas išsiųstas į biurą", free: "Laisva", leave: "Atostogos", half: "pusė dienos", takeOrChoose: "Pirmiausia nufotografuokite arba pasirinkite nuotrauką",
    myTickets: "Mano pažymėjimai", ranOut: "baigėsi", runsOut: "galioja iki", cannotWork: "Negalite dirbti objekte, kol jis nebus atnaujintas. Paskambinkite į biurą.", sendCard: "Siųsti naujos kortelės nuotrauką", cardSent: "Išsiųsta. Biuras patikrins ir atnaujins jūsų pažymėjimą", cardWaiting: "Išsiųsta į biurą, laukia patikrinimo", van: "Jūsų furgonas", doNotDrive: "Nevairuokite, kol biuras neatnaujins.", dueBy: "terminas", booked: "Užregistruotas į kursą",
  },
};

/** Things a crew most often finds that were not in the price. English is what the office sees. */
export const EXTRAS: { en: string; pl: string; ro: string; pt: string; lt: string }[] = [
  { en: "More decayed or cracked stone or brick than allowed for", pl: "Więcej zniszczonego lub spękanego kamienia albo cegły niż zakładano", ro: "Mai multă piatră sau cărămidă degradată ori crăpată decât s-a prevăzut", pt: "Mais pedra ou tijolo degradado ou fissurado do que o previsto", lt: "Daugiau sutrūnijusio ar suskilusio akmens arba plytų, nei numatyta" },
  { en: "Rotten timber found once opened up", pl: "Po odkryciu znaleziono zgniłe drewno", ro: "S-a găsit lemn putred după desfacere", pt: "Madeira podre encontrada depois de aberto", lt: "Atidengus rasta supuvusi mediena" },
  { en: "Extra scaffold or access needed", pl: "Potrzebne dodatkowe rusztowanie lub dostęp", ro: "Este nevoie de schelă sau acces suplimentar", pt: "É preciso mais andaime ou acesso", lt: "Reikia papildomų pastolių ar priėjimo" },
  { en: "The client on site asked for additional work", pl: "Klient na budowie poprosił o dodatkową pracę", ro: "Clientul de pe șantier a cerut lucrări suplimentare", pt: "O cliente na obra pediu trabalho adicional", lt: "Užsakovas objekte paprašė papildomų darbų" },
];

/** Site instructions, translated for the crews actually on each site. Anything missing falls back to English. */
export const INSTRUCTIONS: Record<string, Partial<Record<Language, string>>> = {
  C719: {
    pl: "Nabożeństwa w niedzielę o 10:30 i w środę o 19:00: żadnych głośnych prac godzinę przed i godzinę po. Żaluzje w komorze dzwonów są kruche, nie opierać o nie drabin. W dachu zakrystii stwierdzono nietoperze, postępować zgodnie z instrukcją ekologa.",
  },
  C720: {
    pl: "Dom jest zamieszkany. Dostawy tylko przez bramę gospodarczą, nigdy główną aleją. Żadnych prac wapiennych, jeśli w ciągu 72 godzin zapowiadany jest mróz. Okna są ponumerowane na rysunku A-204, każde skrzydło ma być oznaczone numerem swojego otworu.",
    pt: "A casa está habitada. Entregas só pelo portão da quinta, nunca pela avenida principal. Nada de trabalhos com cal se houver previsão de geada nas próximas 72 horas. As janelas estão numeradas no desenho A-204, mantenha cada caixilho etiquetado com o seu vão.",
  },
  C721: {
    pl: "Muzeum jest otwarte dla zwiedzających od czwartku do niedzieli: trasa dla zwiedzających przy młynówce ma być wolna i ogrodzona. Zdrowe łupki mają być użyte ponownie na przedniej połaci. Pod wschodnim okapem gniazdują jerzyki, nie zasłaniać budek.",
    lt: "Muziejus lankytojams atviras nuo ketvirtadienio iki sekmadienio: lankytojų takas prie malūno kanalo turi būti laisvas ir aptvertas. Sveikos skalūno plokštės turi būti panaudotos iš naujo priekiniame šlaite. Po rytiniu karnizu peri čiurliai, neužstatykite inkilų.",
  },
  C722: {
    pl: "Sąd obraduje we wtorki i czwartki: w te dni żadnego czyszczenia ani cięcia między 10:00 a 16:00. Światła na daszku ochronnym nad chodnikiem sprawdzać każdego wieczoru. Wpisać się przy stanowisku Służby Sądowej.",
    ro: "Instanța are ședințe marțea și joia: în aceste zile nu se curăță și nu se taie între 10:00 și 16:00. Luminile de pe schela de protecție a trotuarului se verifică în fiecare seară. Semnați de intrare la ghișeul Serviciului Instanțelor.",
  },
  C723: {
    ro: "Birouri ocupate la fiecare etaj. Autorizația pentru container este numai pentru locul din fața numărului 14. Cărămida este moale, făcută manual: la curățarea rosturilor numai scule de mână, fără polizoare.",
    pt: "Escritórios ocupados em todos os pisos. A licença do contentor é só para o lugar em frente ao n.º 14. O tijolo é macio, feito à mão: só ferramentas manuais para abrir as juntas, nada de rebarbadoras.",
  },
  C724: {
    ro: "O singură bandă cu semafoare, numai între 08:00 și 17:30. Niciun material nu trebuie să ajungă în râu: plasa de sub arc rămâne montată până la aprobarea inspectorului piscicol.",
  },
};
