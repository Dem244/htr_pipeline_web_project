import { Injectable } from '@angular/core';
import {Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, user, sendEmailVerification} from '@angular/fire/auth';
import { inject } from '@angular/core';


/**
 * Dieser Service verwaltet die Authentifizierung über Firebase.
 * Bietet MNethode für Login, Registrierung, Logout und Passwort-Zurücksetzung.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  user$ = user(this.auth);

  /**
   * Meldet einen Benutzer mit E-Mail und Passwort an.
   * @param email Mail des Benutzers.
   * @param password Passwort des Benutzers.
   * @return Ein Promise mit dem Anmeldeergebnis.
   */
  async login(email: string, password: string) {
    try{
      const result = await signInWithEmailAndPassword(this.auth, email, password);

      if (!result.user.emailVerified) {
        await this.auth.signOut();
        return { success: false, error: 'Bitte bestätige zuerst deine E-Mail-Adresse', needsVerification: true }; //gibt an, dass eine E-Mail-Verifi erforderlich ist
      }

      return { success: true, user: result.user };
    }catch (error:any) {
      return { success: false, error: this.getErrorMessage(error.code) };
    }


  }

  /**
   * Gibt den aktuell angemeldeten Benutzer zurück.
   * @return Der aktuell angemeldete Benutzer oder null, wenn keiner angemeldet ist.
   */
  getCurrentUser() {
    return this.auth.currentUser;
  }

  /**
   * Registriert einen neuen Benutzer mit E-Mail und Passwort.
   * @param email Mail-Adresse des neuen Benutzers.
   * @param password Passwort des neuen Benutzers.
   */
  async register(email: string, password: string) {
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, password);
      await sendEmailVerification(result.user);
      await this.auth.signOut();
      //console.log('Bestätigungs-E-Mail gesendet an:', result.user.email)
      return { success: true, user: result.user };
    } catch (error: any) {
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  }

  /**
   * @return Ein Promise, das abgeschlossen wird, wenn die Abmeldung erfolgt ist.
   */
  logout() {
    return this.auth.signOut();
  }

  /**
   * Sendet eine Mail zur Zurücksetzung des Passworts an die angegebene Adresse.
   * @param email Mail-Adresse des Benutzers.
   * @return Ein Promise, wenn die E-Mail versendet wurde.
   */
  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }


  /**
   * Gibt eine Fehlermeldung basierend auf Firebase-Fehlercode zurück.
   * @param code Der Fehlercode von Firebase.
   * @return Eine Fehlermeldung.
   * @private
   */
  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/invalid-credential':
        return 'E-Mail oder Passwort ist falsch';
      case 'auth/email-already-in-use':
        return 'Diese E-Mail-Adresse wird bereits verwendet';
      case 'auth/invalid-email':
        return 'Ungültige E-Mail-Adresse';
      case 'auth/weak-password':
        return 'Das Passwort muss mindestens 6 Zeichen lang sein';
      case 'auth/user-not-found':
        return 'Kein Benutzer mit dieser E-Mail gefunden';
      case 'auth/wrong-password':
        return 'Falsches Passwort';
      default:
        return 'Ein Fehler ist aufgetreten';
    }
  }

}
