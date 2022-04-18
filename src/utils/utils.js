export const downloadBlob = function (blob, filename) {
    const a = document.createElement('a');
    a.download = filename;
    a.href = window.URL.createObjectURL(blob);
    a.dataset.downloadurl = ['application/octet-stream', a.download, a.href].join(':');
    a.click();
};
