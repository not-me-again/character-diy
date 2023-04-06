module.exports = {
    method: "POST",
    path: "/api/characters/:id/profilePicture",
    async callback(req, res) {
        
        res.status(200).end();
    }
}