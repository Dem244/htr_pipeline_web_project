import {Component, HostListener} from '@angular/core';
import {MarkdownComponent} from 'ngx-markdown';
import {NgIf} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {DEFAULT_MARKDOWN} from '../../constants/default-markdown';

/**
 * Komponente für das Hilfepopup, sie zeigt die Standard-Markdown-Anleitung an und ermöglicht es dem Benutzer, die Sichtbarkeit des Popups zu steuern.
 */
@Component({
  selector: 'app-help-popup',
  imports: [
    MarkdownComponent,
    NgIf,
    FormsModule
  ],
  templateUrl: './help-popup.component.html',
  styleUrl: './help-popup.component.css',
  standalone: true
})
export class HelpPopupComponent {

  open = false;
  helpText = DEFAULT_MARKDOWN;

  /**
   * Schaltet die Sichtbarkeit des Hilfepopups um.
   */
  toggle() {
    this.open = !this.open;
  }

  /**
   * Schließt das Hilfepopup, indem die open-Variable auf false gesetzt wird.
   * Wird aufgerufen, wenn der User auf den Schließen-Button klickt oder außerhalb des Popups klickt.
   */
  close() {
    this.open = false;
  }

}
