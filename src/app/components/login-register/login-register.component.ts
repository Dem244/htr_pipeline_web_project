import {ChangeDetectorRef, Component} from '@angular/core';
import {MatDialogRef} from '@angular/material/dialog';
import {AuthService} from '../../services/auth.service';
import {MatFormField, MatInput, MatLabel} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {NgIf} from '@angular/common';
import {SnackbarService} from '../../services/snackbar.service';

/**
 * Komponente für die Login- und Registrierung. Bietet Funktionen zum Anmelden, Registrieren und Zurücksetzen des Passworts.
 */
@Component({
  selector: 'app-login-register',
  imports: [
    MatFormField,
    FormsModule,
    MatInput,
    MatButton,
    MatLabel,
    NgIf
  ],
  templateUrl: './login-register.component.html',
  styleUrl: './login-register.component.css',
  standalone: true
})
export class LoginRegisterComponent {
  isLoginMode = true;
  isResetPwMode = false;
  email = '';
  password = '';
  errorMessage = '';
  loading = false;

  passwordVal = {minLength:false, uppercase:false, hasNum:false, hasSpecial:false};

  constructor(private snackbarService: SnackbarService, private authService: AuthService, private dialogRef: MatDialogRef<LoginRegisterComponent>, private cdr: ChangeDetectorRef) {}

  /**
   * Gibt zurück, ob das eingegebene Passwort allen Anforderungen entspirhct.
   */
  get isPasswordValid() {
    return this.passwordVal.minLength && this.passwordVal.uppercase && this.passwordVal.hasNum && this.passwordVal.hasSpecial;
  }

  /**
   * Überprüft ob das eingegebene Passwort:
   * - mindestens 8 Zeichen lang ist
   * - mindestens einen Großbuchstaben enthält
   * - mindestens eine Zahl enthält
   * - mindestens ein Sonderzeichen enthält
   */
  onPasswordChange(){
    this.passwordVal.minLength = this.password.length >= 8;
    this.passwordVal.uppercase = /[A-Z]/.test(this.password);
    this.passwordVal.hasNum = /\d/.test(this.password);
    this.passwordVal.hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(this.password);
  }

  /**
   * Wechselt zwischen Login- und Registrierungsmodus. Setzt dabei auch den Reset-Passwort-Modus zurück und löscht eventuelle Fehlermeldungen.
   */
  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.isResetPwMode = false;
    this.errorMessage = '';
  }

  /**
   * Wechselt in den Reset-Passwort-Modus. Setzt dabei den Login-Modus zurück und löscht eventuelle Fehlermeldungen.
   */
  showResetMode() {
    this.isResetPwMode = true;
    this.isLoginMode = false;
    this.errorMessage = '';
  }

  /**
   * Abbrechen des Reset-Passwort-Modus. Wechselt zurück in den Login-Modus und löscht eventuelle Fehlermeldungen.
   */
  cancelReset() {
    this.isResetPwMode = false;
    this.isLoginMode = true;
    this.errorMessage = '';
  }

  /**
   * Führt die Anmeldung oder Registrierung durch, abhängig vom aktuellen Modus.
   * Validiert die Eingaben und zeigt entsprechende Fehlermeldungen an.
   */
  async onSubmit() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Bitte alle Felder ausfüllen';
      return;
    }
    const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!mailRegex.test(this.email)){
      this.errorMessage = 'Ungültige E-Mail-Adresse';
      return;
    }

    if(!this.isLoginMode && !this.isPasswordValid){
      this.errorMessage = 'Das Passwort erfüllt nicht alle Anforderungen';
      return;
    }

    this.errorMessage = '';
    this.loading = true;
    this.cdr.detectChanges();
    //console.log('Error Message: ', this.errorMessage);

    const result = this.isLoginMode
      ? await this.authService.login(this.email, this.password)
      : await this.authService.register(this.email, this.password);

    console.log('Result: ', result);

    this.loading = false;

    if (!result.success) {
      this.errorMessage = result.error || 'Ein Fehler ist aufgetreten';
    }

    this.cdr.detectChanges();


    if (result.success) {
      this.dialogRef.close({
        success: true,
        isRegistration: !this.isLoginMode
      });
    }

  }

  /**
   * Sendet eine Mail zum Zurücksetzen des Passworts an die angegebene E-Mail-Adresse.
   */
  async resetPassword(){
    if (!this.email) {
      this.errorMessage = 'Bitte E-Mail-Adresse eingeben';
      return;
    }

    this.errorMessage = '';
    setTimeout(() => {  //cdr wurde ersetzt durch setTimeout, da es hier zu einem Fehler kam
      this.loading = true;
    });

    try{
      await this.authService.resetPassword(this.email);
      this.snackbarService.successBar('E-Mail zum Zurücksetzen des Passworts versendet! Bitte überprüfe dein Postfach.', 'OK', 5000);
      this.dialogRef.close();
    }catch (error:any){
      //console.log('Loading: ', this.loading);
      setTimeout(() => {
        this.errorMessage = 'Fehler beim Senden der E-Mail!';
        this.loading = false;
      });
    }
  }

  /**
   * Schließt den Dialog und kehrt zur vorherigen Ansicht zurück.
   */
  close() {
    this.dialogRef.close();
  }


}
