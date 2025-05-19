
/// <reference types="chrome"/>

// Extend chrome types
declare namespace chrome {
  namespace action {
    function onClicked(
      callback: (tab: chrome.tabs.Tab) => void
    ): void;
  }
}
