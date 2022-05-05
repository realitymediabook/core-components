export const downloadBlob = function (blob, filename) {
    const a = document.createElement('a');
    a.download = filename;
    a.href = window.URL.createObjectURL(blob);
    a.dataset.downloadurl = ['application/octet-stream', a.download, a.href].join(':');
    a.click();
};

export const waitForEvent = function(eventName, eventObj) {
    return new Promise(resolve => {
      eventObj.addEventListener(eventName, resolve, { once: true });
    });
  };
  
export const waitForDOMContentLoaded = function() {
    if (document.readyState === "complete" || document.readyState === "loaded" || document.readyState === "interactive") {
        return Promise.resolve(null);
    } else {
        return waitForEvent("DOMContentLoaded", window);
    }
};
 