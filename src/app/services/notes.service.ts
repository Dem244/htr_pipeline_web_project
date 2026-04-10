import { Injectable } from '@angular/core';
import {collection, addDoc, serverTimestamp, Firestore, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, getDoc, limit} from '@angular/fire/firestore';
import {AuthService} from './auth.service';
import {StorageService} from './storage.service';



//Quellen:
//https://stackoverflow.com/questions/60243420/what-is-the-difference-between-admin-firestore-timestamp-now-and-admin-firesto
//https://firebase.google.com/docs/firestore/query-data/get-data

//Notizen:
// Mit doc() --> Referenz auf ein Dokument erstellen, z.B. für Update oder Delete
// Mit collection() --> Referenz auf eine Sammlung erstellen, z.B. für Add oder Query
// mit getDoc() --> Ein einzelnes Dokument abrufen, z.B. für getNoteById
// mit getDocs() --> Mehrere Dokumente abrufen
// Ref --> Referenz auf ein Dokumen oder Collection
// Snapshot --> Ergebnis einer Datenabfrage (mit getDoc oder getDocs)
/**
 * Note Interface, repräsentiert eine Notiz in der Datenbank.
 */
export interface Note{
  id: string;
  userID: string;
  folder: string;
  title: string;
  content: string;
  createdAt: Date;
  openedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
/**
 * NotesService: Service für die Verwaltung von Notizen. Bietet Funktionen zum Erstellen, Abrufen, Aktualisieren und Löschen von Notizen.
 * Alle Funktionen sind asynchron und verwenden Firestore als Datenbank.
 */
export class NotesService {
  constructor(private fireStorage: StorageService ,private firestore: Firestore, private authService: AuthService) {
  }

  /**
   * Erstelle ine neue Notiz in Firestore.
   * @param title Titel der Notiz.
   * @param content Markdown-Inhalt der Notizt.
   * @param folder Ordner/Kategorie der Notiz.
   *
   * @returns Die ID der erstellten Notiz.
   */
  async createNote(title: string, content: string, folder: string) {
    const currUser = this.authService.getCurrentUser();
    if (!currUser) {
      throw new Error('User nicht angemeldet');
    }
    const notesCollection = collection(this.firestore, 'notes'); //Zugriff auf Firestore und auf die "notes" Collection
    const docRef = await addDoc(notesCollection, {
      userID: currUser.uid,
      title,
      content,
      folder,
      createdAt: serverTimestamp(),
      openedAt: serverTimestamp(),
    });
    return docRef.id;  //Dokument-ID wird hier erstellt
  }

  /**
   * Lädt alle Notizen eines Benutzers aus Firestore.
   * @param userID Die Firebase-UID des Benutzers
   * @returns Ein Array von Notizen, die dem Benutzer gehören.
   */
  async getUserNotes(): Promise<Note[]> {
    const currUser = this.authService.getCurrentUser();
    if (!currUser) {
      throw new Error('User nicht angemeldet');
    }
    const quer = query(collection(this.firestore, 'notes'), where('userID', '==', currUser.uid)); // Alle Notizen des aktuellen Users
    const querySnapshot = await getDocs(quer);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() // alle gespeicherten Felder der Notiz übernehmen
    } as Note));
  }


  /**
   * Aktualisiert den Inhalt einer Notiz und setzt das openedAt-Feld auf den aktuellen Timestamp, um die zuletzt geöffnete Notiz zu verfolgen.
   * @param noteId Die ID der zu aktualisierenden Notiz.
   * @param content Der Markdown-Inhalt, der in der Notiz gespeichert werden soll.
   */
  async updateNoteContent(noteId: string, content: string) {
    const noteRef = doc(this.firestore, 'notes', noteId);
    await updateDoc(noteRef,{content, openedAt: serverTimestamp()});
  }

  /**
   * Aktualisiert Titel und Ordner/Kategorie einer Notiz.
   * @param noteId Die ID der zu aktualisierenden Notiz.
   * @param title Der neue Titel der Notiz.
   * @param folder Der neue Ordner/Kategorie der Notiz.
   */
  async updateNote(noteId: string, title: string, folder: string): Promise<void> {
    const noteRef = doc(this.firestore, 'notes', noteId);
    await updateDoc(noteRef, {
      title,
      folder,
      openedAt: serverTimestamp()
    });
  }

  /**
   * Aktualisiert das openedAt-Feld einer Notiz.
   * @param noteId Die ID der zu aktualisierenden Notiz.
   */
  async updateNoteOpenedAt(noteId: string): Promise<void> {
    const noteRef = doc(this.firestore, 'notes', noteId);
    await updateDoc(noteRef, {
      openedAt: serverTimestamp()
    });
  }

  /**
   * Löscht eine Notiz dauerhaft aus Firestore.
   * @param noteId Die ID der zu löschenden Notiz.
   */
  async deleteNote(noteId: string) {
    const currUser = this.authService.getCurrentUser();
    const noteRef = doc(this.firestore, 'notes', noteId);
    await deleteDoc(noteRef);

    await this.fireStorage.deleteStorageNoteFolder(currUser!.uid, noteId); // Alle Bilder der Notiz löschen, da diese in einem Ordner mit der Notiz-ID gespeichert werden
  }

  /**
   * Lädt alle Ordner des aktuellen Benutzers.
   *
   * @returns Array mit allen Ordnernamen.
   */
  async getCurrUserFolders(): Promise<string[]> {

    const notes = await this.getUserNotes();
    const folders = new Set<string>();
    notes.forEach(note => {
      if (note.folder) {
        folders.add(note.folder); //von jeder Notiz Foldernamane in Set speichern
      }
    });
    return Array.from(folders);
  }

  /**
   * Lädt eine einzelne Notiz anhand ihrer ID aus Firestore.
   * Wird verwendet, um die zuletzt geöffnete Notiz zu laden oder eine Notiz zum Bearbeiten zu öffnen.
   * @param noteId Die ID der zu ladenden Notiz.
   * @returns Die Notiz-Daten oder null, falls nicht gefunden
   */
  async getNoteById(noteId: string): Promise<Note | null> {
    try {
      const noteRef = doc(this.firestore, 'notes', noteId);
      const noteSnapshot = await getDoc(noteRef);
      if (noteSnapshot.exists()) {
        return { id: noteSnapshot.id, ...noteSnapshot.data() } as Note;
      }
      return null;
    } catch (error) {
      console.error('Fehler beim Laden der Notiz:', error);
      return null;
    }
  }

  /**
   * Lädt die zuletzt geöffnete Notiz eines Benutzers, basierend auf dem openedAt-Feld.
   * Die Notiz mit dem neuesten openedAt-Wert wird zurückgegeben.
   * Ist auch wichtig beim löschen der aktuell angezeigten Notiz, damit die zuletzt geöffnete Notiz geladen werden kann, wenn die aktuell angezeigte Notiz gelöscht wird.
   * @param userId Die UID des Benutzers.
   * @returns Die zuletzt geöffnete Notiz oder null, falls keine Notiz gefunden wird.
   */
  async getRecentNote(userId: string): Promise<Note | null> {
    try{
      const quer = query(collection(this.firestore, 'notes'),
        where('userID', '==', userId),
        orderBy('openedAt', 'desc'), limit(1));  //Zeitpunkt des letzten Öffnens sortieren, damit die zuletzt geöffnete Notiz oben steht, limit(1) damit nur die oberste Notiz zurückgegeben wird
      const snapshot = await getDocs(quer);
      if (snapshot.empty) {
        return null;
      }
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Note;
    }catch (error) {
      console.error('Fehler beim Laden der zuletzt geöffneten Notiz:', error);
      return null;
    }
  }



}

