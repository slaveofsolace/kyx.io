import './style.css';
import { UserAccount } from './core/UserAccount.js';

const form = document.getElementById('local-profile-form');
const nameInput = document.getElementById('profile-name');
const errorMessage = document.getElementById('profile-error');

function showError(message) {
  if (!errorMessage) return;
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function clearError() {
  errorMessage?.classList.add('hidden');
}

const existingProfile = UserAccount.profile();
if (nameInput && existingProfile) {
  nameInput.value = existingProfile.displayName;
  nameInput.select();
}

nameInput?.addEventListener('input', clearError);

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  clearError();

  const result = UserAccount.setDisplayName(nameInput?.value ?? '');
  if (!result.ok) {
    showError(result.err);
    nameInput?.focus();
    return;
  }

  window.location.replace('/');
});
