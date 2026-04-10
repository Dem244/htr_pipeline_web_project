import { Injectable } from '@angular/core';

/**
 * Interface für einen Cache-Eintrag, der die zwischengespeicherten Daten und den Zeitstempel der Speicherung enthält.
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service für die Verwaltung von zwischengespeicherten Bildern in localStorage.
 */
@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private CACHE_TIME = 24 * 1000 * 60 * 60; // 24 Stunden

  /**
   * Lädt die Bilder für eine gegebene noteId aus dem Cache.
   * @param noteId Die ID der Note, für die die Bilder geladen werden sollen.
   */
  getImages(noteId: string): Array<{ url: string; name: string }> | null {
    try {
      const cached = localStorage.getItem(this.getCacheKey(noteId));
      if (!cached) return null;

      const entry: CacheEntry<Array<{ url: string; name: string }>> = JSON.parse(cached);

      //console.log('Cache-Eintrag für NoteId ', noteId, ': ', entry);
      //console.log('Zeit seit Speicherung: ', Date.now() - entry.timestamp);
      // Prüfen, ob Cache noch gültig ist
      if (Date.now() - entry.timestamp > this.CACHE_TIME) {
        this.clearImages(noteId);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Fehler beim Laden aus Cache:', error);
      return null;
    }
  }

  /**
   * Speichert die Bilder bzw. die Download-URLs der Bilder für eine gegebene noteId im Cache.
   * @param noteId Die ID der Note, für die die Bilder gespeichert werden sollen.
   * @param images Ein Array von Objekten, die die Download-URL und den Dateinamen jedes Bildes enthalten. Jedes Objekt hat die Form `{url: string;name:string }`
   */
  setImages(noteId: string, images: Array<{ url: string; name: string }>): void {
    try {
      const entry: CacheEntry<Array<{ url: string; name: string }>> = { // Cache-Eintrag mit Daten und aktuellem Zeitstempel erstellen
        data: images,
        timestamp: Date.now()
      };
      localStorage.setItem(this.getCacheKey(noteId), JSON.stringify(entry));
    } catch (error) {
      console.error('Fehler beim Speichern im Cache:', error);
    }
  }

  /**
   * Löscht die zwischengespeicherten Bilder für eine gegebene noteId aus dem Cache.
   * @param noteId Die ID der Note, für die die Bilder gelöscht werden sollen.
   */
  clearImages(noteId: string): void {  // Wird genutzt, um Bilder zu löschen, die nicht mehr gültig sind (älter als 24 Stunden)
    //oder wenn ein Bild gelöscht wird, damit der Cache aktualisiert wird.
    localStorage.removeItem(this.getCacheKey(noteId));
  }

  /**
   * Löscht alle zwischengespeicherten Bilder aus dem Cache.
   * Wird genutzt wenn der Benutzer sich abmeldet.
   */
  clearAllImages(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.filter(key => key.startsWith('images_'))
        .forEach(key => localStorage.removeItem(key));
      console.log('Cache-Eintäge nach clearAllImages (log-out): ', Object.keys(localStorage));
    } catch (error) {
      console.error('Fehler beim Löschen des gesamten Caches:', error);
    }
  }

  /**
   * Cache-Key von NoteId abgeleitet, um die Bilder für jede Note eindeutig zu speichern.
   * @param noteId Die ID der Note, für die der Cache-Key generiert werden soll.
   */
  private getCacheKey(noteId: string): string {
    return `images_${noteId}`;  // Mit Prefix, damit beim Löschen nur die Bilder gelöscht werden können, ohne andere Daten in localStorage zu beeinflussen
  }

}
