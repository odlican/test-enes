const { NodeSettings } = require("@looker/sdk-node");

class CustomLookerReadConfig extends NodeSettings {
    constructor(settings) {
        super('', settings)
        this.settings = settings;
    }

    readConfig(_section) {
        return {
            client_id: this.settings.client_id,
            client_secret: this.settings.client_secret,
        }
    }
}

module.exports = CustomLookerReadConfig;