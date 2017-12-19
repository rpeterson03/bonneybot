const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((req, res) => {

    const db = admin.firestore();     // Initialize the FireStore database

    console.log('Request headers: ' + JSON.stringify(req.headers));
    console.log('Request body: ' + JSON.stringify(req.body));

    // An action is a string used to identify what needs to be done in fulfillment
    let action = req.body.result.action;

    // Parameters are any entities that DialogFlow has extracted from the request
    const parameters = req.body.result.parameters;

    // Contexts are objects used to track and store conversation state
    const inputContexts = req.body.result.contexts;

    // Get the request source slack/facebook/et
    const requestSource = (req.body.originalRequest) ? req.body.originalRequest.source : undefined;

    //If the source is Twillio get the phone_number and lookup the user_id
    let phone_number = "";

    if (requestSource == 'twilio') {

        phone_number = req.body.originalRequest.data['From'];
    }
    else{

        phone_number = "+14805102384"
        console.log("WARNING TEST PHONE NUMBER USED!!!")
    }

    //This function handles all actions
    const actionHandlers = {

        'default': () => {
            console.log("Default action handler called. Something went wrong");
            res.json(formatResponse('Looks like something went really wrong. Don\'t worry I will notify someone'));

        },

        'welcome': () => {
            getUsersByValue("phone_number", phone_number).then(users => {
                if (users.empty) {
                    res.json(formatResponse("Hi I’m BonneyBot 🤖! Enter your registration code to get started!"));
                }
                else if (users.size > 0) {
                    users.forEach(user => {
                        res.json(formatResponse("Hello " + user.get("first_name") + ", good to see you again!"));
                    })
                }
            }).catch(reason => console.log("getUsers failed because " + reason))
        },

        'register': () => {
            const registration_code = parameters.registration_code;

            const employee_match_registration = db.collection('employees')
                .where("registration_code", "==", registration_code);

            //See if their phone is already registered
            getUsersByValue("phone_number", phone_number).then(users => {
                if (users.empty) {
                    getUsersByValue("registration_code", registration_code) //Look for a matching registration code
                        .then(users => {
                            if (users.empty) {
                                res.json(formatResponse("I couldn't find the registration code " + registration_code))

                            } else if (users.size > 0) {
                                const user = users.docs[0]; //Get the first users
                                updateUserPhone(user.id); //Set this phone number as the user's registered phone number
                                res.json(formatResponse("Thanks "  + user.get("first_name") + " you are all registered! I can now help you take notes just say \"Take a note\" "))
                            }
                        })
                }
                else {
                    res.json(formatResponse("You are already registered. Try taking a note by saying \"Take a note\""))
                }
            })

        },

        'note.add': () => {
            const note = parameters['note'];
            const member_first_name = (parameters['given-name'] != "")? parameters['given-name'] : undefined;
            const member_last_name = (parameters['last-name'] != "") ? parameters['last-name'] : undefined;
            getUserId("phone",phone_number).then(user_id => {
                getEmployee(user_id,member_first_name,member_last_name)
                .then(employees => {const employee = employees.docs[0]
                    employee.ref.collection('notes').add({employee_id:employee.id, body: note}).then(res.json(formatResponse("Note added succesfully")))
                })
            })
        }
    }

    // missing action will call default function.
    if (!actionHandlers[action]) {
        action = 'default';
    }

    // Call the handler with action type
    actionHandlers[action]();


    //HELPER FUNCTIONS

    function updateUserPhone(userId) {
        //update the employee's phone number
        db.collection("users")
            .doc(userId)
            .update(
                {
                    "phone_number": phone_number
                }
            )
    }


    function getUsersByValue(field, value) {
        if (field != undefined && value != undefined) {
            return db.collection("users").where(field, "=", value).get()
        }
        if (field == undefined && value == undefined){
            return db.collection("users").get()
        }
    }

    function getEmployeeData(employeeId, fieldPath) {
        return db.collection("employees")
            .doc(employeeId)
            .get()
            .then(t => t.get(fieldPath)).catch(p1 => p1);
    }

    function getEmployee(leader_id, first_name, last_name){
        console.log("Called getEmployee employee using: " + "Leader Id: " + "\"" + leader_id + "\"" + " First Name: " + "\"" + first_name + "\"" + " Last Name:" + "\"" +last_name + "\"");
        return new Promise ((resolve, reject) => {
            //TODO fix & test the elseif statements

            if (leader_id != undefined && first_name != undefined && last_name != undefined) {
                db.collection('employees')
                    .where("leader_id", "==", leader_id)
                    .where("first_name", "==", first_name)
                    .where("last_name","==",last_name).get().then(employees => resolve(employees))
            }
            else if (leader_id != undefined && first_name != undefined) {
                return db.collection('employees')
                    .where("leader_id", "==", leader_id)
                    .where("first_name", "==", first_name).get().then(employees => resolve(employees));
            }
            else if (leader_id != undefined) {
                return db.collection('employees')
                    .where("leader_id", "==", leader_id)
                    .get().then(employees => resolve(employees))
            }
            else {
                reject("No if matched");
            }
        })
    }

    function getUserId(type,value){
        return new Promise((resolve, reject) => {
            if (type == "phone"){
                db.collection('users')
                    .where("phone_number","=",value)
                    .get()
                    .then(users => resolve(users.docs[0].id))
                    .catch(reason => reject(reason))
            }

        })



    }

/// Helper to format the response JSON object
    function formatResponse(text) {
        console.log("Format Response called with " + text);
        return {
            speech: text,
            displayText: text,
            data: {},
            contextOut: [],
            source: '',
            followupEvent: {}
        }
    }
});