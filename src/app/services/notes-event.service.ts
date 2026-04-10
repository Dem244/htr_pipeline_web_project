import { Injectable } from '@angular/core';
import {Subject} from 'rxjs';

/**
 * Service für die Notizen-Events.
 * Ermöglicht das Emitten von Events, wenn eine Notiz erstellt oder gelöscht wird.
 * Wird in der NotesDropdownComponent verwendet, um die Notizliste zu aktualisieren, wenn eine Notiz erstellt oder gelöscht wird.
 */
@Injectable({
  providedIn: 'root',
})
export class NotesEventService {
  private noteCreated = new Subject<void>();
  private noteDeleted = new Subject<string>();

  public noteCreated$ = this.noteCreated.asObservable();  // Wird in AppComponent und NotesDropdownComponent genutzt, um auf das Erstellen einer neuen Notiz zu reagieren und die UI entsprechend zu aktualisieren
  public noteDeleted$ = this.noteDeleted.asObservable(); // Wird in AppComponent genutzt, um auf das Löschen einer Notiz zu reagieren und die UI entsprechend zu aktualisieren

  /**
   * Emit wenn eine neue Notiz erstellt wurde.
   * Die Komponente, die auf dieses Event hört, kann dann z.B. die Notizliste aktualisieren.
   */
  emitNoteCreated() {
    this.noteCreated.next();
  }

  emitNoteDeleted(noteId: string) {
    this.noteDeleted.next(noteId);  // Wird in NotesDropdownComponent aufgerufen, wenn eine Notiz gelöscht wird. In app.component.ts wird dann entsprechend die UI aktualisert
  }  //Dafür dient this.notesEvent.noteDeleted$.subscribe in app.component.ts, um auf das Löschen einer Notiz zu reagieren und die UI entsprechend zu aktualisieren
  // Mittels next wird die ID an alle Objekte die subscrive auf noteDeleted$ haben gesendet, damit diese die gelöschte Notiz aus der UI entfernen können.
}
