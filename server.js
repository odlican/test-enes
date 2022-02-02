const express = require('express');
const cors = require('cors');
const lookersdk = require('@looker/sdk-node');
const CustomLookerReadConfig = require('./custom-looker-read-config');
const { ServiceAlert, ServiceAlertProcess } = require('./services');

const app = express();
app.use(cors({
    origin: ['http://localhost:3000', 'https://inventivelooker.web.app', 'https://inventive-new.web.app']
}))

app.get('/all_lookml_models', async (req, res) => {
    const lookerSetting = JSON.parse(req.headers['x-inventive-looker-setting']);

    const sdk = lookersdk.LookerNodeSDK.init40(new CustomLookerReadConfig(lookerSetting));
    const result = await sdk.all_lookml_models({});
    res.send(result);
});

app.get('/lookml_model_explore', async (req, res) => {
    console.log('\n>>>API lookml_model_explore');
    const lookerSetting = JSON.parse(req.headers['x-inventive-looker-setting']);
    const model_name = req.headers['x-inventive-lookml-model-name'];
    const explore = req.headers['x-inventive-explore'];

    const sdk = lookersdk.LookerNodeSDK.init40(new CustomLookerReadConfig(lookerSetting));
    const result = await sdk.lookml_model_explore(model_name, explore).catch(error => console.log(error));
    res.send(result);
})

app.get('/run_query', async (req, res) => {
    const lookerSetting = JSON.parse(req.headers['x-inventive-looker-setting']);
    const model_name = req.headers['x-inventive-lookml-model-name'];
    const explore = req.headers['x-inventive-explore'];
    const filters = JSON.parse(req.headers['x-inventive-filters']);
    const fields = JSON.parse(req.headers['x-inventive-fields']);

    const sdk = lookersdk.LookerNodeSDK.init40(new CustomLookerReadConfig(lookerSetting));
    const result = await sdk.run_inline_query({
        result_format: 'json',
        body: {
            model: model_name,
            view: explore,
            fields: fields,
            filters: filters,
            limit: 20,
        }
    });
    res.send(result);
})

app.get('/get_lists', async (req, res) => {
    const lookerSetting = JSON.parse(req.headers['x-inventive-looker-setting']);
    const model_name = req.headers['x-inventive-lookml-model-name'];
    const explore = req.headers['x-inventive-explore'];
    const fields = JSON.parse(req.headers['x-inventive-fields']);
    const group_by = req.headers['x-inventive-groupby'];
    const sdk = lookersdk.LookerNodeSDK.init40(new CustomLookerReadConfig(lookerSetting));
    const result = await sdk.run_inline_query({
        result_format: 'json',
        body: {
            model: model_name,
            view: explore,
            fields: fields,
            filters: '',
            group_by: group_by
        }
    });
    const key = group_by.replace(/\"/g, '')
    const data = result.value.map(element => {
        return element[key]
    })
    result.value = data;
    res.send(result);
})

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
    ServiceAlert(300000);
});
