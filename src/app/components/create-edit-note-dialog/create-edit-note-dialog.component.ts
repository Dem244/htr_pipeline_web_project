import {Component, Inject, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NotesService} from '../../services/notes.service';
import {MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef} from '@angular/material/dialog';
import {MatError, MatFormField, MatHint, MatInput, MatLabel} from '@angular/material/input';
import {NgForOf, NgIf} from '@angular/common';
import {MatOption} from '@angular/material/core';
import {MatSelect} from '@angular/material/select';
import {MatButton} from '@angular/material/button';
import {firstValueFrom} from 'rxjs';
import {AuthService} from '../../services/auth.service';
import {NotesEventService} from '../../services/notes-event.service';
import {SnackbarService} from '../../services/snackbar.service';

//Quellen:
//https://angular.dev/api/forms/FormGroup
//Dort werden auch die Funktionen, patchValue, setErrors etc. erklärt

//Notizen:
//FormGroup eine Art von Container für Formularelemente, die es ermöglicht, mehrere FormControls zu gruppieren und deren Werte und Validierungen gemeinsam zu verwalten
//Validators hat eine Sammlung von Funktionen, kann für FormControls verwendet werden, um die Eingaben zu validieren, z.B. required, minLength, maxLength etc.
//subscribe führt bei Änderungen an einem Observable (z.B. valueChanges) eine Funktion aus. (z.B. Validierung bei Änderungen durchführen)
@Component({
  selector: 'app-create-edit-note-dialog',
  imports: [
    MatFormField,
    NgForOf,
    MatOption,
    ReactiveFormsModule,
    MatDialogContent,
    MatDialogActions,
    MatSelect,
    MatLabel,
    MatHint,
    NgIf,
    MatInput,
    MatButton,
    MatError
  ],
  templateUrl: './create-edit-note-dialog.component.html',
  styleUrl: './create-edit-note-dialog.component.css',
  standalone: true
})
export class CreateEditNoteDialogComponent implements OnInit{
  noteForm: FormGroup;
  existingFolders: string[] = [];
  initContent: string = '';
  folderError: string | null = null;
  editMode = false;
  noteId: string | null = null;

  constructor(private snackbar: SnackbarService, private notesEvent: NotesEventService ,private fb: FormBuilder, private authService: AuthService ,private notesService: NotesService, private dialogRef: MatDialogRef<CreateEditNoteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { existingFolders: string[], content: string, editMode?: boolean, noteId?: string, currTitle?: string, currFolder?: string }
  ) {
    this.noteForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
      folder: [''],
      newFolder: ['']
    });
    this.initContent = data.content || '';
    this.editMode = data.editMode || false;
    this.noteId = data.noteId || null;
  }

  /**
   * Initialisiert die Komponente und lädt die vorhandenen Ordner des Users.
   * Im Edit-Modus werden die aktuellen Werte in das Formular gesetzt.
   * Richtet zudem Validierungen für Titel, Ordner und neuen Ordner ein.
   */
  async ngOnInit(): Promise<void> {
    try{
      this.existingFolders = await this.notesService.getCurrUserFolders();
    }catch (error){
      console.log("Fehler beim Laden der Ordner: ", error);
      this.existingFolders = [];
    }

    //Vorhandene Werte in Formluar laden, wenn im Editiermodus
    if(this.editMode && this.data.currTitle && this.data.currFolder){
      this.noteForm.patchValue({ // nur bestimmte Werte in Form setzen, deshalb patchValue
        title: this.data.currTitle,
        folder: this.data.currFolder
      })
    }

    // auf newFolder von FormGroup greifen, durch valueChanges auf Änderungen reagieren und Validierung durchführen
    // Wenn ein neuer Ordner eingegeben wird, soll die Dropdown-Auswahl zurückgesetzt werden
    this.noteForm.get('newFolder')?.valueChanges.subscribe(value => {
      if (value?.trim()) {
        this.noteForm.get('folder')?.setValue('');
      }this.valNewFolder(value);
      this.valTitle();
    });

    this.noteForm.get('folder')?.valueChanges.subscribe(value => {
      if (value) {
        this.noteForm.get('newFolder')?.setValue('');
        this.folderError = null;
      }this.valTitle();
    });

    this.noteForm.get('title')?.valueChanges.subscribe(() => {
      this.valTitle();
    });
  }

  /**
   * Validiert die Eingabe für einen neuen Ordner.
   * Prüft auf Mindestlänge und ob der Ordner bereits existiert.
   * @param inputFol Der eingegebene Ordnername.
   */
  valNewFolder(inputFol: string): void {
    const folderControl = this.noteForm.get('newFolder');
    const trimmedInput = inputFol?.trim() || '';

    if (!trimmedInput) {  // Wenn Eingabefeld leer ist, werden alle Fehler zurückgesetzt
      folderControl?.setErrors(null);
      return;
    }

    if (trimmedInput.length < 3) {  // Wenn zu kurz.
      folderControl?.setErrors({ minlength: true });
      return;
    }

    if (this.existingFolders.includes(trimmedInput)) { // Wenn der Ordner bereits exisztiert.
      folderControl?.setErrors({ folderExists: true });
    } else {
      folderControl?.setErrors(null);
    }
  }

  /**
   * Validiert den Titel, achtet dabei, ob Duplikate in Firestore vorhanden sind.
   * Prüft außerdem, ob ein Titel bereits im ausgewählten Ordner existiert.
   * Berücksichtigt sowohl neue als auch bestehende Ordner.
   */
  async valTitle(): Promise<void> {
    const titleControl = this.noteForm.get('title');
    const title = titleControl?.value?.trim();
    const folder = this.noteForm.get("newFolder")?.value?.trim() ||this.noteForm.get("folder")?.value; // Es muss entweder ein neuer Ordner eingegeben oder ein vorhandener Ordner ausgewählt werden

    if (!title || !folder) {
      titleControl?.setErrors(null);
      return;
    }

    if (title.length < 3){
      titleControl?.setErrors({ minlength: true });
      return;
    }

    try {
      const currUser = await firstValueFrom(this.authService.user$);
      if (!currUser) return;

      const notes = await this.notesService.getUserNotes();
      const dupli = notes.find(note =>
        note.title === title && note.folder === folder
      );

      if (dupli) {
        titleControl?.setErrors({ titleDuplicate: true });
      } else {
        titleControl?.setErrors(null);
      }
    } catch (error) {
      console.error('Fehler beim Prüfen:', error);
    }
  }

  /**
   * Prüft, ob das Formular gültig ist.
   * Berücksichtigt Titel, Ordnerauswahl.
   * @returns true, wenn alle Validierungen bestanden wurden, sonst false.
   */
  get isFormValid(): boolean {
    const titleControl = this.noteForm.get('title');  //Mit get auf Titel zugreifen, um Validierung und Wert zu prüfen
    const newFolderControl = this.noteForm.get('newFolder');
    const folderControl = this.noteForm.get('folder');

    // Durch titleControl.value? erhält man den aktuellen Wert des Titel Feldes
    const titleValid = titleControl?.valid && !!titleControl.value?.trim();
    const folderSelected = !!newFolderControl?.value?.trim() || !!folderControl?.value; //Es muss entweder ein neuer Ordner eingegeben oder ein vorhandener Ordner ausgewählt werden
    const newFolderValid = !newFolderControl?.errors; // Wenn es Fehler gibt, ist der neue Ordner ungültig


    return titleValid! && folderSelected && newFolderValid;
  }

  /**
   * Prüft, ob bereits Ordner für den Benutzer existieren, um die Anzeige der Dropdown-Liste zu steuern.
   * @returns true, wenn vorhandene Ordner existieren, sonst false.
   */
  get hasExistingFolders(): boolean {
    return this.existingFolders.length > 0;
  }

  /**
   * Erstellt eine neue Notiz oder aktualisiert eine bestehende Notiz basierend auf dem Modus (editMode).
   * Schließt den Dialog mit Erfolgs oder Fehlerstatus.
   */
  async onSubmit(): Promise<void> {
    if (!this.isFormValid) {
      console.error("Formular nicht gültig");
      return;
    }

    const title = this.noteForm.value.title;
    const newFolder = this.noteForm.value.newFolder?.trim();
    const selectedFolder = this.noteForm.value.folder;

    const folder = newFolder || selectedFolder;

    console.log("Finaler Ordner:", folder);

    if (!folder) {
      console.error("Keine Kategorie ausgewählt oder eingegeben");
      return;
    }

    try {
      // Bearbeiten einer Notiz
      if(this.editMode && this.noteId){
        await this.notesService.updateNote(this.noteId, title, folder);
        this.snackbar.successBar("Notiz erfolgreich aktualisiert!", "OK", 3000);
        this.dialogRef.close({
          success: true,
          noteId: this.noteId,
          title,
          folder,
          content: this.initContent
        });
      }else{
        const noteId = await this.notesService.createNote(title, this.initContent, folder);
        this.notesEvent.emitNoteCreated();  //Notwendig, wenn man die Notiz vor dem Login erstellt, damit die Ordner in der Dropdown-Liste aktualisiert werden
        this.snackbar.successBar("Notiz erfolgreich erstellt!", "OK", 3000);
        this.dialogRef.close({
          success: true,
          noteId,
          title,
          folder,
          content: this.initContent // Content zurückgeben
        });
      }
    } catch (error) {
      console.error("Fehler beim Erstellen der Notiz: ", error);
      this.dialogRef.close({ success: false });
    }
  }


  /**
   * Schließt den Dialog ohne zu speichern.
   */
  onCancel(): void {
    this.dialogRef.close(false);
  }



}
