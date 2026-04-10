import { Injectable } from '@angular/core';
import {BehaviorSubject} from 'rxjs';
// https://blog.angular-university.io/angular-loading-indicator/

/**
 * Verwaltet den Ladezustand der Anwendung.
 */
@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable(); // Observable, das den aktuellen Ladezustand bereitstellt

  /**
   * Setzt den Ladezustand auf "true", um anzuzeigen, dass eine Ladeoperation im Gange ist.
   */
  loadingOn(){
    this.loadingSubject.next(true);
  }

  /**
   * Setzt den Ladezustand auf "false", um anzuzeigen, dass die Ladeoperation abgeschlossen ist.
   */
  loadingOff(){
    this.loadingSubject.next(false);
  }
}
