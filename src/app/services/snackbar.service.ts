import { Injectable } from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';

//Quellen:
// https://material.angular.io/components/snack-bar/overview

@Injectable({
  providedIn: 'root',
})
export class SnackbarService {
  constructor(private snackBar: MatSnackBar) {}

  /**
   * Zeigt eine Snackbar mit einer Erfolgsmeldung an.
   * @param message Die Nachricht, die in der Snackbar angezeigt werden soll.
   * @param action Die Aktion, die in der Snackbar angezeigt werden soll.
   * @param dur Die Dauer, für die die Snackbar angezeigt werden soll (ms).
   */
  successBar(message: string, action: string = 'OK', dur:number) {
    this.snackBar.open(message, action, {
      duration: dur
    });
  }

  /**
   * Zeigt eine Snackbar mit einer Fehlermeldung an.
   * @param message Die Nachricht, die in der Snackbar angezeigt werden soll.
   * @param action Die Aktion, die in der Snackbar angezeigt werden soll.
   * @param dur Die Dauer, für die die Snackbar angezeigt werden soll (ms).
   */
  errorBar(message: string, action: string = 'OK', dur:number) {
    this.snackBar.open(message, action, {
      duration: dur
    });
  }
}
