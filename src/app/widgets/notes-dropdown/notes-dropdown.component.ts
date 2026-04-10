import {ChangeDetectorRef, Component, EventEmitter, OnInit, Output} from '@angular/core';
import {AuthService} from '../../services/auth.service';
import {MatIcon} from '@angular/material/icon';
import {MatDivider} from '@angular/material/list';
import {MatMenu, MatMenuTrigger} from '@angular/material/menu';
import {AsyncPipe, DatePipe, NgForOf, NgIf} from '@angular/common';
import {Note, NotesService} from '../../services/notes.service';
import {firstValueFrom} from 'rxjs';
import {CreateEditNoteDialogComponent} from '../../components/create-edit-note-dialog/create-edit-note-dialog.component';
import {MatDialog} from '@angular/material/dialog';
import {NotesEventService} from '../../services/notes-event.service';
import {MatIconButton} from '@angular/material/button';
import {SnackbarService} from '../../services/snackbar.service';


/**
 * Schnittstelle zur Gruppierung von Notizen nach Ordnern.
 * Jede FolderGroup enthält den Namen des Ordners, die darin enthaltenen Notizen und einen Status, ob der Ordner in der Dropdown-Ansicht aufgeklappt ist oder nicht.
 */
interface FolderGroup {
  folderName: string;
  notes: Note[];
  isExpanded: boolean;
}

@Component({
  selector: 'app-notes-dropdown',
  imports: [
    MatIcon,
    MatDivider,
    MatMenu,
    MatMenuTrigger,
    NgIf,
    DatePipe,
    NgForOf,
    AsyncPipe,
    MatIconButton
  ],
  templateUrl: './notes-dropdown.component.html',
  styleUrl: './notes-dropdown.component.css',
  standalone: true
})
/**
 * Dropdown-Komponente zur Verwaltung und Anzeigen von Notizen.
 * Bietet Funktionen zum Erstellen, Bearbeiten, Löschen und Auswählen von Notizen, die nach Ordnern gruppiert sind.
 */
export class NotesDropdownComponent implements OnInit{
  @Output() noteSelected = new EventEmitter<{ noteId: string; content: string }>(); //Wenn eine Notiz ausgewählt wird, wird die ID und der Inhalt der Notiz an die AppComponent gesendet, um sie im Markdown-Bereich anzuzeigen.
  @Output() noteDeleted = new EventEmitter<string>(); //Wenn gelöscht

  notes: Note[] = [];
  folders: FolderGroup[] = [];
  constructor(private snackbar: SnackbarService,private notesEvent: NotesEventService ,private cdr: ChangeDetectorRef, public authService: AuthService, protected notesService: NotesService, private dialog: MatDialog) {
  }

  /**
   * Initialisiert die Komponente und lädt die Notizen des aktuellen Benutzers.
   * Registriert auch einen Listener für das Erstellen neuer Notizen, um die Liste automatisch zu aktualisieren.
   */
  ngOnInit(): void {
    this.authService.user$.subscribe(async user => {
      if (user) {
        await this.loadNotes();
      }
    });

    // Wenn durchs einloggen eine neue Notiz erstellt wurde, lädt die Notizen neu
    this.notesEvent.noteCreated$.subscribe(async () => {
      await this.loadNotes();
    });
  }

  /**
   * Konvertiert Firebase-Timestamps in JavaScript Date-Objekte.
   * Notwendig, da Firebase-Timestamps nicht direkt als Date-Objekte verwendet werden können.
   * @param timestamp Der Firebase-Timestamp, der konvertiert werden soll.
   * @return Date-Objekt
   */
  convertToDate(timestamp: any): Date {
    if (timestamp?.toDate) {
      return timestamp.toDate();
    }
    return new Date(timestamp);
  }

  /**
   * Gruppiert die notizen nach ihren Ordnern/Kategorien.
   * Wird in der loadNotes-Methode aufgerufen, um die Notizen in der Dropdown-Ansicht entsprechend zu organisieren.
   * @param notes Die Liste der Notizen, die gruppiert werden soll.
   * @private
   */
  private groupNotesByFolder(notes: Note[]): void {
    const folderMap = new Map<string, Note[]>();

    notes.forEach(note => {
      const folder = note.folder || 'Ohne Kategorie';
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(note);
    });
    // Konvertiert die Map in ein Array von FolderGroup-Objekten, um die Ordner und ihre Notizen darzustellen.
    this.folders = Array.from(folderMap.entries()).map(([folderName, notes]) => ({
      folderName,
      notes,
      isExpanded: false
    })); // Alle Ordner standardmäßig geschlossen
  }

  /**
   * Lädt alle Notizen des aktuelle Benutzers.
   * Notizen werden nach Ordnern gruppiert und die Ansicht wird aktualisiert.
   */
  async loadNotes(): Promise<void> {
    const currUser = await firstValueFrom(this.authService.user$);
    try {
      const notes = await this.notesService.getUserNotes();
      this.groupNotesByFolder(notes);
    } catch (error) {
      console.error('Fehler beim Laden der Notizen:', error);
    }
  }

  /**
   * Öffnet den Dialog zur Erstellung einer neuen Notiz.
   * Nach erfolgreicher Erstellung wird die Notiz-Liste neu geladen und die neu erstellte Notiz an die AppComponent gesendet, um sie direkt anzuzeigen.
   */
  openCreateNoteDialog(): void {
    const dialogRef = this.dialog.open(CreateEditNoteDialogComponent, {
      width: '500px',
      data: {
        existingFolders: this.folders.map(f => f.folderName),
        content: '' // Leer da neue Notiz
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        await this.loadNotes();

        // neue erstellte Notiz an AppComponent
        this.noteSelected.emit({
          noteId: result.noteId,
          content: result.content || '' // Falls content undefined ist, wird ein leerer String gesendet
        });
      }
    });
  }

  /**
   * Öffnet den Editierdialog, aktuell wird der gleiche Dialog wie für die Erstellung genutzt.
   * @param note Die zu bearbeitende Notiz.
   * @param event Das Klick-Event.
   */
  async editNote(note: Note, event: Event): Promise<void> {
    event.stopPropagation(); // Verhindert, dass die Dropdown-Auswahl geschlossen wird, wenn eine Notiz bearbeitet wird.

    const dialogRef = this.dialog.open(CreateEditNoteDialogComponent, {
      width: '500px',
      data: {
        existingFolders: this.folders.map(f => f.folderName), // Alle vorhandenen Ordner, damit der Nutzer einen auswählen oder einen neuen erstellen kann
        content: note.content,
        editMode: true,
        noteId: note.id,
        currTitle: note.title,
        currFolder: note.folder
      }
    });
    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        await this.loadNotes();

        //Emit die bearbeitete motiz an appComponent
        this.noteSelected.emit({
          noteId: result.noteId,
          content: result.content || ''
        });
      }
    });
  }

  /**
   * Löscht eine Notiz nach Bestätigung durch den Nutzer.
   * Entfernt die Notiz aus Firestore und dem Lokalen Array.
   * @param noteId Die ID der zu löschenden Notiz.
   * @param noteTitle Titel der Notiz.
   * @param event Das Klick-Event.
   */
  async deleteNote(noteId: string, noteTitle: string, event: Event): Promise<void> {
    event.stopPropagation();

    const confirmed = window.confirm(
      `Möchtest du die Notiz "${noteTitle}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await this.notesService.deleteNote(noteId);

      // Entfernt die Notiz aus dem lokalen Array
      this.folders.forEach(folder => {
        folder.notes = folder.notes.filter(note => note.id !== noteId);
      });

      // Entfernt leere Ordner
      this.folders = this.folders.filter(folder => folder.notes.length > 0);

      this.notesEvent.emitNoteDeleted(noteId);  // Emit an app.component.ts, damit die UI aktualisiert werden kann, wenn die gelöschte Notiz aktuell angezeigt wird
      this.snackbar.successBar("Notiz wurde erfolgreich gelöscht!", "OK", 3000);
      //Lädt notizen neu
      await this.loadNotes();

    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  }

  /**
   * Lädt die ausgewählte Notiz und sendet sie an die AppComponent, um sie im Markdown-Bereich anzuzeigen.
   * @param note Die ausgewählte Notiz, die geladen werden soll.
   */
  selectNote(note: Note): void {
    this.noteSelected.emit({
      noteId: note.id,
      content: note.content
    });
  }

  /**
   * Klappt einen Ordner auf oder zu.
   * @param folder Die Folder-Gruppe, die aufgeklappt oder zugeklappt werden soll.
   */
  toggleFolder(folder: FolderGroup): void {
    folder.isExpanded = !folder.isExpanded;
  }

}
