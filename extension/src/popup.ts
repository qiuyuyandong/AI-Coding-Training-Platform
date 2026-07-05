const statusNode = document.querySelector("#status");
chrome.storage.local.get(["lastCaptureError"], (items) => {
  if (statusNode) {
    statusNode.textContent = items.lastCaptureError ? `Last error: ${items.lastCaptureError}` : "No recent capture errors";
  }
});
