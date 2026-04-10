import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateEditNoteDialogComponent } from './create-edit-note-dialog.component';

describe('CreateNoteDialogComponent', () => {
  let component: CreateEditNoteDialogComponent;
  let fixture: ComponentFixture<CreateEditNoteDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateEditNoteDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateEditNoteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
