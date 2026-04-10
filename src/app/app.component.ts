import {ChangeDetectorRef, Component, HostListener, OnInit, ViewChild} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MarkdownComponent, provideMarkdown} from 'ngx-markdown';
import {CommonModule} from '@angular/common';
import {KatexOptions} from 'ngx-markdown';
import {UploadComponent} from './components/upload/upload.component';
import {HelpPopupComponent} from './components/help-popup/help-popup.component';
import {MaskEditorComponent} from './components/mask-editor/mask-editor.component';
import {HttpClient} from '@angular/common/http';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {AuthService} from './services/auth.service';
import {LoginRegisterComponent} from './components/login-register/login-register.component';
import {SnackbarService} from './services/snackbar.service';
import {NotesDropdownComponent} from './widgets/notes-dropdown/notes-dropdown.component';
import {debounceTime, distinctUntilChanged, Subject} from 'rxjs';
import {NotesService} from './services/notes.service';
import {CreateEditNoteDialogComponent} from './components/create-edit-note-dialog/create-edit-note-dialog.component';
import {DEFAULT_MARKDOWN} from './constants/default-markdown';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {NotesEventService} from './services/notes-event.service';
import {MatIcon} from '@angular/material/icon';
import {LoadingService} from './services/loading.service';
import {SidebarComponent} from './components/sidebar/sidebar.component';
import {CacheService} from './services/cache.service';
import {MatSnackBarModule} from '@angular/material/snack-bar';


//Quellen/Notizen:
//https://www.mediaevent.de/javascript/local-storage.html (localStorage
// - kann 5-10 MB Daten speichern
// - speichert auch nach neuladen der Seite, bis es explizit gelöscht wird
// - localStorage.setItem('key', 'value'); //Speichern
//Ablauf: 1. User öffnet Notiz (setItem wird gesetzt), 2. User schließt Seite, 3. User öffnet Seite erneut (getItem liest ID und öffnet zuletzt geöffnete Notiz)

//https://stackoverflow.com/questions/3888902/what-is-the-best-way-to-detect-a-change-in-a-textarea (Auto-Save mit debounceTime und distinctUntilChanged)


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule, MatSnackBarModule, MatProgressSpinner, MarkdownComponent, UploadComponent, HelpPopupComponent, MaskEditorComponent, CommonModule, MatButton, NotesDropdownComponent, MatIcon, MatIconButton, SidebarComponent],
  templateUrl: './app.component.html',
  providers: [provideMarkdown()],
  standalone: true,
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit{
  @ViewChild(UploadComponent) uploadComponent!: UploadComponent;
  currentNoteId: string | null = null;
  currentNotePath: string = '';
  private markdownChanged = new Subject<string>();  //Subject wie ein EventEmitter, aber mit RxJS-Funktionalität, um Auto-Save zu implementieren
  private waitingMarkdown: string | null = null; //Um Markdown vor Login zu speichern
  title = 'HTR-NoteExtractor';
  defaultMarkdown = DEFAULT_MARKDOWN;

  markdown = this.defaultMarkdown;
  changedMarkdown = false; // Wichtig für die Warnung beim Verlassen der Seite (wenn User nicht eingeloggt ist)
  hasContent = false; // Wichtig für das Icon, zeigt an, dass gerade nicht gespeichert wird (im ausgeloggten Zustand)
  hasAnyNotes = false; //WIchtig für die Anzeige der Notizen-Dropdown, soll nur angezeigt werden, wenn der Benutzer mindestens eine Notiz hat
  loadingLastNote = false; //Für die Anzeige eines Ladeindikators, während die zuletzt geöffnete Notiz geladen wird
  sidebarOpen = false;


  constructor(private cacheService: CacheService ,public loadingService: LoadingService,private notesEvent: NotesEventService ,private cdr: ChangeDetectorRef,private notesService: NotesService, private snackbarService: SnackbarService, private http: HttpClient, private dialog: MatDialog, public authService: AuthService) {
    this.markdownChanged // Wird verwendet, um Änderungen am Markdown-Inhalt zu verfolgen und au0to-save  auszulösen
      .pipe(  //pipe, um mehrere Regeln für die Verarbeitung der Änderungen anzuwenden (debounceTime und distinctUntilChanged)
        debounceTime(3000),
        distinctUntilChanged() //nur bei Änderungen
      )
      .subscribe(async (content) => { //subscribe, um auf die Änderungen zu reagieren
        if (this.currentNoteId && content.trim() !== this.defaultMarkdown.trim()) {
          await this.autoSaveNote(content);  // Speichern
        }
      });

    this.notesEvent.noteCreated$.subscribe(() => {
      this.checkIfUserHasNotes();
    });
    this.notesEvent.noteDeleted$.subscribe(async (deletedNoteId) => { // Wenn Notiz gelöscht wird, prüfen, ob sie aktuell geöffnet ist, und UI aktualisieren
      await this.handleNoteDeleted(deletedNoteId); //Triggert dann entweder das öffnen der zuletzt geöffneten Notiz oder das Zurücksetzen der UI, wenn keine Notizen mehr vorhanden sind
    });
  }

  /**
   * Initialisiert die Komponente, indem sie auf Änderungen des Benutzerstatus achtet.
   */
  ngOnInit() {
    this.authService.user$.subscribe(async user => {
      if (user) {
        this.loadingLastNote = true; // Wichtig für die Anzeige des Ladeindikators, während die zuletzt geöffnete Notiz geladen wird
        await this.checkIfUserHasNotes(); //Gibt für hasAnyNotes false oder true zurück, wenn hasAnyNotes false und lastNoteId null ist, dann wird der Content (Editor) nicht angezeigt (siehe html)
        const lastNoteOpened = await this.notesService.getRecentNote(user.uid);
        if (lastNoteOpened){
          await this.loadNote(lastNoteOpened.id, lastNoteOpened.content); //Lädt die zuletzt geöffnete Notiz
        }
        this.loadingLastNote = false;
        this.cdr.detectChanges();
      } else { // Wenn nicht angemeldet
        // nur UI zurücksetzen
        this.currentNoteId = null;
        this.markdown = this.defaultMarkdown;
        this.hasContent = false;
        this.changedMarkdown = false;
        this.loadingLastNote = false;
      }
    });
  }

  public options: KatexOptions = {
    displayMode: true,
    throwOnError: false,
    errorColor: '#cc0000',
  };


  /**
   * Öffnet das Login/Registrieren Popup.
   * Speichert ggf. den aktuellen Markdown-Inhalt, um ihn nach dem Login wiederherzustellen.
   */
  openAuthPopup() {
    // Das ist der Fall, wenn die Default-Markdown angezeigt wird, aber der Benutzer bereits Inhalt eingegeben hat, sich dann aber entscheidet, sich einzuloggen, bevor er eine Notiz erstellt hat.
    //In diesem Fall soll der eingegebene Inhalt nicht verloren gehen, sondern nach dem Login in einer neuen Notiz wiederhergestellt werden.
    if(this.markdown.trim() !== this.defaultMarkdown.trim()){
      this.waitingMarkdown = this.markdown;
    }

    const dialogRef = this.dialog.open(LoginRegisterComponent, {
      width: '450px',
      panelClass: 'auth-dialog'
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        if (result?.isRegistration) {
          this.snackbarService.successBar(
            'Bestätigungs-E-Mail versendet! Bitte überprüfe dein Postfach.',
            'OK',
            5000
          );
        }
        if (!result.isRegistration && this.waitingMarkdown) { // Wenn registriert und eingeloggt und es Markdown-Inhalt gab
          await this.openCreateNoteDialogWithContent(this.waitingMarkdown); // Dann öffnet sich nach Anmeldung direkt der Dialog zum Erstellen einer neuen Notiz
          this.waitingMarkdown = null;
        } else { //Wenn kein Markdown-Inhalt, dann prüfen, ob Benutzer Notizen hat, damit das Dropdown entsprechend angezeigt wird
          await this.checkIfUserHasNotes();
        }
      }

    });
  }

  /**
   * Öffnet den Dialog zum Erstellen einer neuen Notiz mit vorgegebenem Notizen-Content.
   * Wichtig für das Erstellen einer Notiz nach dem Login, wenn bereits Inhalt vorhanden ist.
   * @param content Der Markdown-Inhalt für die neue Notiz.
   */
  async openCreateNoteDialogWithContent(content: string): Promise<void> {
    const dialogRef = this.dialog.open(CreateEditNoteDialogComponent, {
      width: '500px',
      data: {
        existingFolders: [], //Wenn vorhandene Ordner/Kategorien vorhanden sind, werden sie geladne
        content: content //Markdown-Inhalt übergeben
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        this.currentNoteId = result.noteId;
        this.markdown = result.content || content; // Wenn result.content nicht existiert, dann den übergebenen Inhalt verwenden
        this.changedMarkdown = false;
        this.hasContent = true;
        this.snackbarService.successBar('Notiz erfolgreich erstellt!', 'OK', 3000);
        console.log("Notiz wurde erstellt: ", result.noteId);
      }
    });
  }

  /**
   * Meldet den aktuellen Benutzer ab und lädt die Seite neu.
   */
  async logout() {
    this.changedMarkdown = false;  //keine Warnung mehr anzeigen, da Benutzer sowieso abmeldet
    this.currentNoteId = null;
    this.cacheService.clearAllImages(); //Cache leeren, damit keine Bilder von vorherigen Notizen angezeigt werden
    await this.authService.logout();
    window.location.reload();
  }



  /**
   * Wird aufgerufen, wenn sich der Markdown-Inhalt ändert.
   * Aktualisiert den Status der Notiz und löst den Auto-Save Mechanismus aus.
   */
  onMarkdownChange(){
    this.hasContent = this.markdown.trim().length > 0;
    this.changedMarkdown = this.markdown.trim() !== this.defaultMarkdown.trim();

    if (this.currentNoteId) {
      this.markdownChanged.next(this.markdown);  // Sendet Wert an das Subject, um den Auto-Save auszulösen
    }
  }

  /**
   * Speichert die aktuelle Notiz automatisch in Firestore.
   * @param content Der Markdown-Inhalt der Notiz.
   * @private
   */
  private async autoSaveNote(content: string): Promise<void> {
    if (!this.currentNoteId) return;
    try {
      await this.notesService.updateNoteContent(this.currentNoteId, content);
      console.log('Notiz automatisch gespeichert');
    } catch (error) {
      console.error('Auto-Save fehlgeschlagen:', error);
    }
  }


  /**
   * Lädt eine Notiz in die UI.
   * @param noteId Die ID der zu ladenden Notiz.
   * @param content Der Markdown-Inhalt der Notiz.
   */
  async loadNote(noteId: string, content: string): Promise<void> {
    this.currentNoteId = noteId;
    try {
      const note = await this.notesService.getNoteById(noteId);
      if (note) {
        this.markdown = note.content.trim() === '' ? this.defaultMarkdown : note.content;//Wenn Inhalt leer, dann Default, ansonsten Inhalt
        this.currentNotePath = `${note.folder} / ${note.title}`;
        await this.notesService.updateNoteOpenedAt(noteId); // Öffnungszeit aktualisieren, damit die zuletzt geöffnete Notiz verfolgt werden kann
      } //else {
        //this.markdown = content.trim() === '' ? this.defaultMarkdown : content;
        //this.currentNotePath = '';
      //}
    } catch (error) {
      console.error('Fehler beim Laden der Notiz:', error);
      this.markdown = content.trim() === '' ? this.defaultMarkdown : content; // Falls Fehler auftritt, zumindest den übergebenen Inhalt laden
      this.currentNotePath = '';
    }

    this.changedMarkdown = false; //Ist für die Warnung beim Verlassen der Seite wichtig, damit sie nicht fälschlicherweise angezeigt wird, wenn eine Notiz geladen wird
    this.hasContent = this.markdown.trim() !== this.defaultMarkdown.trim(); //Wenn Markdown nicht leer und nicht default, dann hat es Inhalt (ist für die Anzeige wichtig)
    this.cdr.detectChanges();
  }

  /**
   * Wird aufgerufen, wenn der Upload abgeschlossen ist.
   * Hängt den hochgeladenen Inhalt an die aktuelle Markdown-Notiz an.
   * @param event Upload-Event mit dem generierten Markdown-Inhalt.
   */
  onUploadFinished(event: any) {
    console.log('Empfangener Text:', JSON.stringify(event.result));
    if (this.markdown.trim() === this.defaultMarkdown.trim()) {
      // Wenn noch Default-Markdown,dann komplett ersetzen
      this.markdown = event.result;
    } else {
      this.markdown += '\n\n' + event.result;
    }

    this.onMarkdownChange();
    this.uploadComponent.clearFile();
  }

  /**
   * Warnt den Benutzer beim Verlassen der Seite, wenn ungespeicherte Änderungen vorhanden sind.
   * Dieser Fall tritt ein, wenn der Benutzer nicht eingeloggt ist und versucht, die Seite zu verlassen.
   * @param event Das BeforeUnloadEvent-Objekt.
   */
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (!this.changedMarkdown || this.authService.getCurrentUser()){ // Wenn keine Änderungen vorhanden oder eingeloggt, dann keine Warnung anzeigen, da entweder nichts verloren geht oder die Notiz automatisch gespeichert wird
      return;
    }
    //Warnung anzeigen
    event.preventDefault();
    event.returnValue = "";
  }

  /**
   * Prüft, ob dder eingeloggte Benutzer Notizen hat, und setzt die hasAnyNotes Variable entsprechend.
   */
  async checkIfUserHasNotes(): Promise<void> {
    try{
      const notes = await this.notesService.getUserNotes();
      this.hasAnyNotes = notes.length > 0; // Wenn Benutzer mindestens eine Notiz hat, wird das Dropdown angezeigt, wird dann true
      setTimeout(() => { //Ist notwendig, da vorher die Änderung von hasAnyNotes nicht erkannt wird
        this.cdr.detectChanges();
      });
    }catch (error){
      console.error('Fehler beim Überprüfen der Notizen: ', error);
      this.hasAnyNotes = false;
      setTimeout(() => {
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Behandelt das Ereignis, wenn eine Notiz gelöscht wird. Wenn die gelöschte Notiz aktuell geöffnet war, wird die UI zurückgesetzt und die zuletzt geöffnete Notiz geladen (falls vorhanden).
   * @param deletedNoteId Die ID der gelöschten Notiz.
   * @private
   */
  private async handleNoteDeleted(deletedNoteId: string): Promise<void> {
    //Wenn gelöschte Notiz aktuell offen war
    if (this.currentNoteId === deletedNoteId) {
      this.currentNotePath = ''; //Pfad zurücksetzen
      //this.currentNoteId = null;
      this.cdr.detectChanges(); //Gegen NG0100
      //Zuletzt geöffnete Notiz aus Firestore
      const currUser = this.authService.getCurrentUser();
      if (currUser) {
        const mostRecentNote = await this.notesService.getRecentNote(currUser.uid); //Wenn es eine zuletzt geöffnete Notiz gibt, lade sie, ansonsten UI zurücksetzen

        if (mostRecentNote) {
          this.loadNote(mostRecentNote.id, mostRecentNote.content);
        } else {
          //Keine Notizen mehr, dann UI zurücksetzen
          this.currentNoteId = null;
          this.markdown = this.defaultMarkdown;
          this.hasContent = false;
          this.changedMarkdown = false;
        }
      }
    }
    await this.checkIfUserHasNotes();
  }

  /**
   * Wechselt den Zustand der Seitenleiste (Sidebar) zwischen geöffnet und geschlossen.
   */
  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  /**
   * Exportiert die aktuelle Markdown-Notiz als PDF-Datei.
   * Die PDF-Generierung erfolgt serverseitig.
   */
  downloadPdf(){
    this.http.post('http://localhost:3000/pdf', {markdown: this.markdown}, {responseType: 'blob'})
      .subscribe(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'download.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
      })
  }
}
