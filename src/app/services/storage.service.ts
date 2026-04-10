import { Injectable } from '@angular/core';
import {Storage, ref, uploadBytes, getDownloadURL, deleteObject, listAll} from '@angular/fire/storage';
import {AuthService} from './auth.service';
import {firstValueFrom} from 'rxjs';

//Quellen:
// https://github.com/angular/angularfire/blob/main/docs/storage.md#cloud-storage
//https://firebase.google.com/docs/storage/web/upload-files
// https://firebase.google.com/docs/storage/web/delete-files?hl=de

/**
 * Service für die Verwaltung von Bildern in Firebase Storage. Bietet Funktionen zum Hochladen, Abrufen und Löschen von Bildern.
 */
@Injectable({
  providedIn: 'root',
})
export class StorageService {
  constructor(private storage: Storage, private authService: AuthService) {
  }
  private MAX_THREE_MB = 3 * 1024 * 1024;

  /**
   * Lädt ein Bild in Firebase Storage hoch und gibt die Download-URL zurück.
   * @param file Die Bilddatei, die hochgeladen werden soll.
   * @param noteId Die Note-ID, unter der das Bild gespeichert werden soll. Das Bild wird im Pfad `users/{userId}/notes/{noteId}/{fileName}` gespeichert.
   * @returns Die Download-URL des hochgeladenen Bildes.
   */
  async uploadImage(file: File, noteId: string): Promise<string> {
    if (file.size > this.MAX_THREE_MB) {
      throw new Error('Datei ist zu groß. Maximal 3 MB erlaubt.');
    }
    const currUser = await firstValueFrom(this.authService.user$);
    const filePath = `users/${currUser?.uid}/notes/${noteId}/${file.name}`;
    const storageRef = ref(this.storage, filePath);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  /**
   * Löscht alle Bilder und den Ordner einer Notiz aus Firebase Storage.
   * Wird aufgerufen, wenn eine Notiz gelöscht wird, um alle zugehörigen Bilder ebenfalls zu entfernen und den Speicherplatz freizugeben.
   * @param uid ID des Benutzers, da der Pfad der Bilder die Benutzer-ID enthält.
   * @param noteId ID der Notiz.
   */
  async deleteStorageNoteFolder(uid: string, noteId: string): Promise<void> {
    const noteImagePath = `users/${uid}/notes/${noteId}`;
    const folderRef = ref(this.storage, noteImagePath);

    try{
      const listRes = await listAll(folderRef);
      const deletePromises = listRes.items.map((itemRef) =>
        deleteObject(itemRef)
      );
      await Promise.all(deletePromises);
    }catch (error) {
      console.log(`Fehler beim Löschen des Ordners ${noteImagePath}:`, error);
    }
  }

  /**
   * Löscht ein Bild aus Firebase Storage anhand der Download-URL.
   * @param imageUrl Die Download-URL des Bildes, das gelöscht werden soll. Das Bild wird anhand des Pfads in der URL identifiziert und gelöscht.
   */
  async deleteImage(imageUrl: string): Promise<void> {
    const storageRef = ref(this.storage, imageUrl);
    await deleteObject(storageRef);
  }

  /**
   * Ruft alle Bilder einer Notiz aus Firebase Storage ab und gibt ein Array von Objekten zurück, die die Download-URL und den Dateinamen jedes Bildes enthalten.
   * @param notedId Die ID der Notiz.
   * @returns Ein Array von Objekten, die die Download-URL und den Dateinamen jedes Bildes enthalten. Jedes Objekt hat die Form `{url: string;name:string }`
   */
  async getNoteImages(notedId: string): Promise<Array<{ url: string; name: string }>> {
    const currUser = await firstValueFrom(this.authService.user$);
    const folderPath = `users/${currUser?.uid}/notes/${notedId}/`;
    const folderRef = ref(this.storage, folderPath); // Erzeugt erstes GET Request (liefert ne Liste)

    try {
      const result = await listAll(folderRef);
      const images = await Promise.all(
        result.items.map(async (item) => ({
          url: await getDownloadURL(item),  // Erzeugt für jedes Bild ein GET Request, um die Download-URL zu erhalten
          name: item.name
        }))
      );
      return images;
    }catch (error) {
      console.error('Fehler beim Abrufen der Bilder:', error);
      return [];
    }
  }

}
