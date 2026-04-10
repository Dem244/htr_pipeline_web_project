//https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault
//https://developer.mozilla.org/de/docs/Web/API/DataTransfer
//https://v17.angular.io/api/core/NgZone
import {Component, EventEmitter, NgZone, Output} from '@angular/core';

import { HttpClient, HttpClientModule } from '@angular/common/http';
import {LoadingService} from '../../services/loading.service';

/**
 * Komponente für den Datei-Upload.
 * Sie ermöglicht es dem Benutzer, eine Datei auszuwählen und per Drag&Drop hochzuladen.
 * Nachdem hochladen der Datei wird diese ans Backend gesendet und die Antwort zurückgegeben.
 */
@Component({
  selector: 'app-upload',
  imports: [
    HttpClientModule
  ],
  templateUrl: './upload.component.html',
  standalone: true,
  styleUrl: './upload.component.css'
})
export class UploadComponent {
  file: any;
  @Output() textGenerated = new EventEmitter<string>();
  @Output() uploadFinished = new EventEmitter<{ file: File; result: any;}>();
  constructor(private loadingService: LoadingService,private http: HttpClient) {  //NgZone erzwingt die Änderungen (also setzen des generierten Textes in den Editor)
  }

  /**
   * Wird aufgerufen, wenn ein Benutzer eine Datei auswählt oder per Drag&Drop hochlädt.
   * Es leitet die Datei an das Backend weiter und gibt die Antwort zurück, sobald der Upload abgeschlossen ist.
   * @param event
   */
  getFile(event: any) {
    event.preventDefault() // Damit reingezogene Dateien z.B. Bilder kein Tab öffnen (sonst wird auch die Datei nicht übernommeen
    let file;
    if(event.target.files){
      file = event.target.files[0]; // Klick auf Input
    }else if (event.dataTransfer.files){ // datatransfer (enthält die Dateien die per Drag&Drop hereingezogen werden)
      file = event.dataTransfer.files[0];
    }
    this.file = file;
    const form = new FormData();
    form.append('image', file);

    this.loadingService.loadingOn();

    this.http.post("http://localhost:5000/upload", form)
      .subscribe({
        next: (result: any) => {
          this.loadingService.loadingOff();
          this.uploadFinished.emit({
            file: this.file,
            result
          });
          console.log('Backend Response:', result);
        }
      });


  }

  /**
   * Verhindert das Standardverhalten, wenn eine Datei über die Komponente gezogen wird, damit z.B. kein neues Tab mit dem Bild geöffnet wird.
   * @param event Das DragEvent, das ausgelöst wird, wenn eine Datei über die Komponente gezogen wird.
   */
  onDragOver(event: DragEvent) {
    event.preventDefault(); // Damit beim reinziehen des Bildes sich nicht ein neuer Tab des Bildes öffnet
  }

  /**
   * Setzt die aktuell ausgewählte Datei zurück
   */
  clearFile(){
    this.file = undefined;
  }

}
