const lookersdk = require('@looker/sdk-node');
const { firebaseFirestore } = require('./firebase');
const CustomLookerReadConfig = require('./custom-looker-read-config');
const SendEmail = require('./send-email');
const log4js = require('log4js');
log4js.configure({
    appenders: { logServices: { type: 'file', filename: 'logs/log-services.log' } },
    categories: { default: { appenders: ['logServices'], level: 'debug' } }
});
const logger = log4js.getLogger('logServices');

const GetCollectionDatas = async (firestore, collectionName, conditionFieldName, operator, conditionFieldValue) => {
    var datas = [];
    var snapshots = conditionFieldName && operator && conditionFieldValue
        ? await firestore.collection(collectionName).where(conditionFieldName, operator, conditionFieldValue).get()
        : await firestore.collection(collectionName).get();
    snapshots.forEach(async documentSnapshot => {
        datas.push(documentSnapshot.data());
    });
    return datas;
}

const UpdateCollectionData = (firestore, collectionName, data) => {
    firestore.collection(collectionName).doc(data.id).update(data);
}

const getParamsFromString = (str) => {
    var newTxt = str.split("${");
    var array = [];
    for (var i = 1; i < newTxt.length; i++) {
        array.push(newTxt[i].split("}")[0]);
    }
    return array;
}

const getdatasFromLooker = (array, inlineQuery) => {
    const data = array.map(item => {
        return {
            value: item,
            array: inlineQuery.map(query => query[item])
        }
    })
    return data;
}

const ServiceAlertProcess = async () => {
    console.log('ServiceAlertProcess')
    logger.info(`\n\n===START Alert Service Process at [${new Date}]===`);
    var dataWorkspaces = await GetCollectionDatas(firebaseFirestore, 'Workspaces');
    for (var i = 0; i < dataWorkspaces.length; i++) {
        var dataWorkspace = dataWorkspaces[i];
        // console.log('dataWorkspaces[i] =>', dataWorkspaces[i])
        if (dataWorkspace.looker_base_url && dataWorkspace.looker_client_id && dataWorkspace.looker_client_secret) {
            try {
                const sdk = lookersdk.LookerNodeSDK.init40(new CustomLookerReadConfig({
                    base_url: dataWorkspace.looker_base_url,
                    client_id: dataWorkspace.looker_client_id,
                    client_secret: dataWorkspace.looker_client_secret,
                }));
                var lookerUser = await sdk.ok(sdk.me());
                if (lookerUser && lookerUser.id > 0) {
                    var dataProducts = await GetCollectionDatas(firebaseFirestore, 'Products', 'workspaceId', '==', dataWorkspace.id);
                    for (var j = 0; j < dataProducts.length; j++) {
                        // console.log('dataProducts[j] =>', dataProducts[j])
                        var dataAlerts = await GetCollectionDatas(firebaseFirestore, 'Alerts', 'productId', '==', dataProducts[j].id);
                        for (var k = 0; k < dataAlerts.length; k++) {
                            var dataAlert = dataAlerts[k];
                            var nextStepSendEmail = false;
                            if (dataAlert.batchNotifications) {//Batch email alerts every: dataAlert.notifyFrequency
                                var time = new Date().getTime() - dataAlert.sendMailDate;
                                
                                switch (dataAlert.notifyFrequency) {
                                    case 'hours':
                                        nextStepSendEmail = (time >= 3600000);
                                        break;
                                    case 'day':
                                        nextStepSendEmail = (time >= 86400000);
                                        break;
                                    case 'week':
                                        nextStepSendEmail = (time >= 604800000);
                                        break;
                                    default:
                                        break;
                                }
                            }
                            else {//Send an email for every alert
                                nextStepSendEmail = !dataAlert.sendMailDate;
                            }

                            if (nextStepSendEmail && dataAlert.status && dataAlert.emailRecipients && dataAlert.emailRecipients.length > 0) {
                                var filters = {};
                                // var fields = dataAlert.primaryKeys.map(x => x.name);
                                var fields = dataAlert.filters.map(x => x.name);
                                dataAlert.filters.forEach(x => {
                                    // fields.push(x['name'])
                                    if (filters.hasOwnProperty(x.name)) {
                                        filters[x.name] = filters[x.name] + ' AND ' + x.created_filters;
                                    }
                                    else {
                                        filters[x.name] = x.created_filters;
                                    }
                                });
                                const emailBodyParams = getParamsFromString(dataAlert.emailBody);
                                fields = fields.concat(emailBodyParams);
                                const emailSubjectParams = getParamsFromString(dataAlert.emailSubject);
                                fields = fields.concat(emailSubjectParams);
                                fields.push("products.id");
                                fields.push("users.email");
                                var inlineQuery = await sdk.ok(sdk.run_inline_query(
                                    {
                                        result_format: 'json',
                                        body: {
                                            model: dataWorkspaces[i].selected_explore.model,
                                            view: dataAlert.explore,
                                            fields,
                                            filters,
                                            sorts: [],
                                            limit: 10
                                        }
                                    })
                                );
                                const emailBodyDatas = getdatasFromLooker(emailBodyParams, inlineQuery);
                                const emailSubjectDatas = getdatasFromLooker(emailSubjectParams, inlineQuery);
                                if (inlineQuery && inlineQuery.length > 0) {
                                    var isResponseError = inlineQuery.some(x => x.looker_error);
                                    if (isResponseError) {
                                        logger.error('ResponseError: ', inlineQuery.map(x => x.looker_error));
                                    }
                                    else {
                                        const promises = [];
                                        const logsList = dataAlert.logs || [];
                                        for (let i = 0; i < inlineQuery.length; i++) {
                                            var emailRecipients = dataAlert.emailRecipients;
                                            for (let recipient = 0; recipient < emailRecipients.length; recipient++) {
                                                let curRec = emailRecipients[recipient]
                                                if ( logsList === undefined
                                                    || logsList.filter(log => log.status === 'Delivered' && log.productId === inlineQuery[i]['products.id'] && log.recipient === curRec).length === 0
                                                ) {
                                                    if (curRec === '${users.email}') {
                                                        curRec = inlineQuery[i]['users.email']
                                                    }
                                                    var emailBody = dataAlert.emailBody;
                                                    var emailSubject = dataAlert.emailSubject;
                                                    for (let j = 0; j < emailBodyDatas.length; j++) {
                                                        const replaceStr = emailBodyDatas[j].array[i];
                                                        emailBody = emailBody.replace('${' + emailBodyDatas[j].value + '}', replaceStr)
                                                    }
                                                    for (let j = 0; j < emailSubjectDatas.length; j++) {
                                                        const replaceStr = emailSubjectDatas[j].array[i];
                                                        emailSubject = emailSubject.replace('${' + emailSubjectDatas[j].value + '}', replaceStr)
                                                    }
                                                    if (curRec) {
                                                        console.log({
                                                            emailRecipients: curRec,
                                                            emailCc: dataAlert.emailCc,
                                                            emailSubject,
                                                            emailBody
                                                        })
                                                        promises.push(SendEmail({
                                                            emailRecipients: curRec,
                                                            emailCc: dataAlert.emailCc,
                                                            emailSubject,
                                                            emailBody
                                                        }).then((res) => {
                                                            if (res.success) {
                                                                logsList.push({
                                                                    featureName: dataAlert.name,
                                                                    featureType: 'Alert',
                                                                    recipient: curRec,
                                                                    timeStamp: new Date().getTime(),
                                                                    status: 'Delivered',
                                                                    productId: inlineQuery[i]['products.id']
                                                                });
                                                                dataAlert.logs = logsList;
                                                                UpdateCollectionData(firebaseFirestore, 'Alerts', dataAlert);
                                                            }
                                                            return res;
                                                        }).catch(res => {
                                                            if (!res.success) {
                                                                logsList.push({
                                                                    featureName: dataAlert.name,
                                                                    featureType: 'Alert',
                                                                    recipient: curRec,
                                                                    timeStamp: new Date().getTime(),
                                                                    status: 'Error',
                                                                    productId: inlineQuery[i]['products.id']
                                                                });
                                                                dataAlert.logs = logsList;
                                                                UpdateCollectionData(firebaseFirestore, 'Alerts', dataAlert);
                                                            }
                                                            return res;
                                                        }))
                                                    }
                                                }
                                            }
                                        }
                                        var sendMailResponse = await Promise.all(promises);
                                        const successCount = sendMailResponse.filter(res => res.success).length
                                        if (successCount === promises.length) {
                                            dataAlert.sendMailDate = new Date().getTime();
                                            UpdateCollectionData(firebaseFirestore, 'Alerts', dataAlert);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (error) {
                logger.error(`Connect Looker Error: `, error);
            }
        }
    }
    logger.info(`===END Alert Service Process===`);
}

const ServiceAlert = time => {
    setInterval(ServiceAlertProcess, time);
    // ServiceAlertProcess();
}

module.exports = { ServiceAlert, ServiceAlertProcess };
