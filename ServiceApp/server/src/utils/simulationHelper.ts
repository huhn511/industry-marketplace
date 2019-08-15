import io from 'socket.io-client';
import get from 'lodash/get';
import axios from 'axios';
import yargs from 'yargs';
import format from 'date-fns/format';
import { generate, submodel } from 'SeMarket/Industry_4.0_language/index.js';
import { generateRandomSubmodelValues, getRandomTimestamp } from '../utils/randomizer.js';
import { getRandomUser } from './multiUserHelper';
import { operations } from '../config.json';
import { initializeWalletQueue } from './walletQueueHelper';
import { createCloseLocation } from './locationHelper';

const BASE_URL = 'http://localhost:4000';
const socket = io('http://localhost:4000');


const simulate = async (role) => {

    initializeWalletQueue();

    //For SR send out random CFPs 
    if (role === 'SR') {

        const sendRandomCFP = async () => {
            const id = await getRandomUser(role);

            const randomOperation = await randomValue(operations)
            const randomSubmodel = await submodel(randomOperation)
            const randomSubmodelElements = await generateRandomSubmodelValues(randomSubmodel)
            const randomTimestamp = getRandomTimestamp()


            const submodelValues = {};
            randomSubmodelElements.forEach(({ semanticId, value, valueType }) => {
                if (['date', 'dateTime', 'dateTimeStamp'].includes(valueType)) {
                    submodelValues[semanticId] = Date.parse(value);
                } if (valueType === 'boolean') {
                    submodelValues[semanticId] = Boolean(value);
                } else {
                    submodelValues[semanticId] = value;
                }
            });
            const request = generate({
                messageType: 'callForProposal',
                userId: id,
                creationDate: format(Date.now(), 'DD MMMM, YYYY H:mm a '),
                irdi: randomOperation,
                submodelValues: submodelValues,
                startTimestamp: randomTimestamp[0],
                endTimestamp: randomTimestamp[1],
                location: 'NPHTQORL9XK'
                //await getRandomLocation()
            })
            await apiPost('cfp', request)

        }
        sendRandomCFP();
        //setInterval(sendRandomCFP, 10000);
    }


    //subscribe to ZMQ messages
    socket.on('connect', () => {
        console.log("Connected")
    });
    socket.emit('subscribe', { events: ['tx'] })

    socket.on('zmq', async (message) => {
        const data = get(message, 'data.data')
        if (typeof data === 'string') {
            JSON.parse(data);
        }
        const { type } = data.frame;

        if (['callForProposal'].includes(type)) {

            [1, 2, 3].forEach(async () => {

                const id = await getRandomUser(role);
                const senderLocation = get(data.frame, 'location')
                const location = await createCloseLocation(senderLocation)


                //generate message  
                const request = generate({
                    messageType: 'proposal',
                    originalMessage: data,
                    userId: id,
                    location: location,
                    irdi: await get(data.dataElements.submodels[0].identification, 'id'),
                    price: await randomValue([1, 2, 4, 5, 6, 7, 8, 9])
                })
                //send message to Market Manager

                await new Promise(resolve => setTimeout(resolve, 4000));
                await apiPost('proposal', request)

            })
        }


        if (['proposal'].includes(type)) {

            const userId = get(data.frame.receiver.identification, 'id')

            const request = await generate({
                messageType: 'acceptProposal',
                userId,
                originalMessage: data,
            })

            await apiPost('acceptProposal', request)

        }

        if (['acceptProposal'].includes(type)) {

            const userId = get(data.frame.receiver.identification, 'id')

            const request = await generate({
                messageType: 'informConfirm',
                userId,
                originalMessage: data,
            })
            await apiPost('informConfirm', request)

        }

        if (['informConfirm'].includes(type)) {

            const userId = get(data.frame.receiver.identification, 'id')

            const request = await generate({
                messageType: 'informPayment',
                userId,
                originalMessage: data,
            })

            await apiPost('informPayment', request)

        }
    })

}

const apiPost = async (messageType, message) => {

    const randomTimeout = (min, max) => {
        return min + Math.random() * (max - min);
    }

    await new Promise(resolve => setTimeout(resolve, randomTimeout(5000, 15000)));
    const response = await axios.post(`${BASE_URL}/${messageType}`, message);

    return response.data;
}

const randomValue = array => {
    return array[Math.floor(Math.random() * array.length)]
}



const argv = yargs
    .usage('Simulate SR or SP')
    .example('$0  --role SR', 'simulate SR')
    .required('role', 'Mode must be provided').describe('role', 'Simulates SR or SP. Options: ["SR", "SP"]')
    .describe('role', 'Define user role. Options: ["SR", "SP"]')
    .help('help')
    .argv;

if (argv.role === 'SR') {
    simulate('SR')
}
else if (argv.role === 'SP') {
    simulate('SP')
}