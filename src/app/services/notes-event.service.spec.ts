import { TestBed } from '@angular/core/testing';

import { NotesEventService } from './notes-event.service';

describe('NotesEventService', () => {
  let service: NotesEventService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotesEventService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
