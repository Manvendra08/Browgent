const authBtn = document.getElementById('auth-btn') as HTMLButtonElement | null;
const statusMsg = document.getElementById('status-msg') as HTMLDivElement | null;
const titleEl = document.getElementById('title') as HTMLHeadingElement | null;
const descEl = document.getElementById('desc') as HTMLParagraphElement | null;

async function requestPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusMsg) {
      statusMsg.className = 'status error';
      statusMsg.textContent = 'MediaDevices API is not supported in this browser.';
    }
    return;
  }

  if (authBtn) {
    authBtn.disabled = true;
    authBtn.textContent = 'Requesting access...';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all audio tracks immediately to release the microphone
    stream.getTracks().forEach((track) => track.stop());

    if (statusMsg) {
      statusMsg.className = 'status success';
      statusMsg.textContent = '✓ Microphone permission granted successfully! Returning to Browgent...';
    }
    if (titleEl) titleEl.textContent = 'Microphone Enabled!';
    if (descEl) descEl.textContent = 'You can now dictate goals and prompts in the Browgent sidebar.';
    if (authBtn) authBtn.style.display = 'none';

    // Notify extension sidepanel that mic permission is now active
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      try {
        chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_GRANTED' });
      } catch {
        // Ignore
      }
    }

    // Automatically close tab after a brief confirmation delay
    setTimeout(() => {
      window.close();
    }, 1500);
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string };
    if (authBtn) {
      authBtn.disabled = false;
      authBtn.textContent = 'Try Again';
    }
    if (statusMsg) {
      statusMsg.className = 'status error';
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        statusMsg.textContent = 'Microphone access was denied. Please click the permissions icon in Chrome’s address bar, set Microphone to "Allow", and click Try Again.';
      } else {
        statusMsg.textContent = `Microphone error: ${error?.message || error?.name || 'Permission failed'}`;
      }
    }
  }
}

if (authBtn) {
  authBtn.addEventListener('click', requestPermission);
}

// Automatically trigger on page load if user navigated here directly
document.addEventListener('DOMContentLoaded', () => {
  // Give user 200ms to see the UI before triggering prompt
  setTimeout(() => {
    requestPermission();
  }, 300);
});
