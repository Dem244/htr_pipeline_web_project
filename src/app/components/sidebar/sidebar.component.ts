import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import {StorageService} from '../../services/storage.service';
import {SnackbarService} from '../../services/snackbar.service';
import {MatIcon} from '@angular/material/icon';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {NgForOf, NgIf} from '@angular/common';
import {CacheService} from '../../services/cache.service';

//Quellen:
// https://developer.mozilla.org/de/docs/Web/API/Clipboard/writeText
// https://stackoverflow.com/questions/39501289/angular2-file-upload-with-drag-and-drop
// https://www.mediaevent.de/javascript/drag-and-drop.html

/**
 * Komponente für die Seitenleiste, sie ermöglicht das Hochladen, Anzeigen und Verwalten von Bildern, die mit einer Notiz verknüpft sind.
 */
@Component({
  selector: 'app-sidebar',
  imports: [
    MatIcon,
    MatButton,
    MatIconButton,
    MatProgressSpinner,
    NgIf,
    NgForOf
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  standalone: true
})
export class SidebarComponent implements OnChanges, OnInit{
  @Input() noteId: string | null = null;
  @Input() isOpen = false;
  @Output() insertImage = new EventEmitter<string>();
  @Output() closeSidebar = new EventEmitter<void>();

  images: Array<{ url: string; name: string }> = [];
  isUploading = false;
  isDragging = false;

  constructor(private cacheService: CacheService ,private cdr: ChangeDetectorRef, private storageService: StorageService, private snackBarService: SnackbarService) {
  }

  /**
   * Lädt die Bilder, wen die Komponente initialisiert wird und eine noteId vorhanden ist.
   */
  ngOnInit() {
    if(this.noteId) {
      this.loadImages();
    }
  }

  /**
   * Lädt die Bilder neu, wenn sich die noteId ändert.
   * @param changes
   */
  async ngOnChanges(changes:SimpleChanges): Promise<void> {
    if (changes['noteId'] && this.noteId) {  // Nur laden, wenn sich die noteId ändert
      await this.loadImages();
    }
  }

  /**
   * Lädt die Bilder für die aktuelle noteId.
   * Zuerst wird versucht, die Bilder aus dem Cache zu laden. Wenn sie nicht im Cache sind, werden sie aus dem Storage geladen und im Cache gespeichert.
   */
  async loadImages() {
    if(!this.noteId){
      return;
    }
    console.log('Aktueller Cache für NoteId ', this.noteId, ': ', this.cacheService.getImages(this.noteId));
    const cachedImages = this.cacheService.getImages(this.noteId);
    if (cachedImages) {
      this.images = cachedImages; //Verhindert Storage-Request, wenn Bilder im Cache vorhanden sind
      this.cdr.detectChanges();
      return;
    }
    console.log('Werden die Bilder aus dem Cache geladen? ', cachedImages);
    console.log('Bilder werden aus dem Storage geladen, da sie nicht im Cache sind.');
    try{
      this.images = await this.storageService.getNoteImages(this.noteId!);
      this.cacheService.setImages(this.noteId, this.images);
      this.cdr.detectChanges();
    }catch (error){
      console.error('Fehler beim Laden der Bilder: ', error);
    }
  }

  /**
   * Event-Handler für das Drag-Drop von Dateien.
   * @param event Das DragEvent, das ausgelöst wird, wenn eine Datei über die Drop-Zone gezogen wird.
   */
  onDragOver(event: DragEvent) {
    event.preventDefault(); // Damit wird verhindert dass die Datei im Browser geöffnet wird
    this.isDragging = true; // True setzen, um die Drop-Zone visuell hervorzuheben
  }

  /**
   * Event-Handler für das Verlassen der Drop-Zone.
   * @param event Das DragEvent, das ausgelöst wird, wenn eine Datei die Drop-Zone verlässt.
   */
  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  /**
   * Event-Handler für das Ablegen einer Datei in der Drop-Zone.
   * @param event Das DragEvent, das ausgelöst wird, wenn eine Datei in der Drop-Zone abgelegt wird. Es wird die Datei extrahiert und der Upload-Prozess gestartet.
   */
  async onDrop(event: DragEvent) {
    event.preventDefault();
    //event.stopPropagation();
    this.isDragging = false;
    if (!this.noteId) return;
    this.cdr.detectChanges();

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) { // Nur die erste Datei verarbeiten, falls mehrere Dateien abgelegt wurden
      await this.uploadFile(files[0]);
    }
  }

  /**
   * Event-Handler für die Dateiauswahl über den Datei-Dialog. Es wird die ausgewählte Datei extrahiert und der Upload-Prozess gestartet.
   * @param event
   */
  async onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      await this.uploadFile(file);
      event.target.value = '';
    }
  }

  /**
   * Lädt die ausgewählte Datei hoch.
   * @param file Die Datei, die hochgeladen werden soll.
   * @private
   */
  private async uploadFile(file: File) {
    if (!this.noteId) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      this.snackBarService.errorBar('Nur Bilder (JPEG, PNG, WebP) erlaubt', 'OK', 3000);
      return;
    }

    this.isUploading = true;
    this.cdr.detectChanges();

    try{
      await this.storageService.uploadImage(file, this.noteId);
      this.cacheService.clearImages(this.noteId);
      await this.loadImages();

      this.snackBarService.successBar("Bild erfolgreich hochgeladen!", "OK", 3000);
    }catch (error: any){
      const errorMsg = error.message || 'Fehler beim Hochladen';
      this.snackBarService.errorBar(errorMsg, "OK", 3000);
    }finally {
      this.isUploading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Löscht ein Bild anhand seiner URL.
   * @param imageUrl Die URL des Bildes, das gelöscht werden soll.
   */
  async deleteImage(imageUrl: string) {
    const confirmed = window.confirm("Möchten Sie dieses Bild wirklich löschen?");
    if (!confirmed) return;

    try{
      await this.storageService.deleteImage(imageUrl);
      this.cacheService.clearImages(this.noteId!);
      await this.loadImages();
      this.snackBarService.successBar("Bild erfolgreich gelöscht!", "OK", 3000);
    }catch (error){
      console.error('Fehler beim Löschen des Bildes: ', error);
      this.snackBarService.errorBar("Fehler beim Löschen", "OK", 3000);
    }
  }

  /**
   * Kopiert die Markdown-Syntax für ein Bild in die Zwischenablage, damit der Benutzer sie einfach in seine Notiz einfügen kann.
   * @param imageUrl Die URL des Bildes, das in Markdown eingebunden werden soll.
   * @param imageName Der Name des Bildes, der in der Markdown-Syntax verwendet wird.
   */
  copyImageMarkdown(imageUrl: string, imageName: string) {
    const width = 300; // z.B. dynamisch vom User
    const markdown = `<img src="${imageUrl}" alt="${imageName}" width="${width}" />`;


    // In Zwischenablage kopieren
    navigator.clipboard.writeText(markdown).then(() => {
      this.snackBarService.successBar('Markdown in Zwischenablage kopiert!', 'OK', 2000);
    }).catch(() => {
      this.snackBarService.errorBar('Fehler beim Kopieren', 'OK', 2000);
    });
  }

  /**
   * Schließt die Seitenleiste.
   */
  toggle() {
    this.closeSidebar.emit();
  }


}
