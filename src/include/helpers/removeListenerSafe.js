module.exports = (event, listenerName) => {
    try {
        event.off(listenerName);
    } finally {
        return;
    }
}