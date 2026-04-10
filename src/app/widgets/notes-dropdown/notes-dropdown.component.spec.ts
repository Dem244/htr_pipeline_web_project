import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotesDropdownComponent } from './notes-dropdown.component';

describe('NotesDropdownComponent', () => {
  let component: NotesDropdownComponent;
  let fixture: ComponentFixture<NotesDropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotesDropdownComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotesDropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
