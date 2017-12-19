const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((req, res) => {
    console.log('Request headers: ' + JSON.stringify(req.headers));
    console.log('Request body: ' + JSON.stringify(req.body));

    // An action is a string used to identify what needs to be done in fulfillment
    let action = req.body.result.action;


    // Parameters are any entites that Dialogflow has extracted from the request.
    const parameters = req.body.result.parameters;
    console.log("PARAMETERS:>> " + JSON.stringify(parameters));
    const given_name = req.body.result.parameters['given-name'];
    console.log("Given name set to" + given_name);


    // Contexts are objects used to track and store conversation state
    const inputContexts = req.body.result.contexts;

    // Get the request source slack/facebook/et
    const requestSource = (req.body.originalRequest) ? req.body.originalRequest.source : undefined;
    console.log("Request Source ==" + requestSource);
    // Configure Firestore database
    const db = admin.firestore();

    //Get and set the user_id
    //There has to be a better way to handle the scoping
    var user_id="+14805102384";



    //Get the phone number if from SMS
    if (requestSource == 'twilio') {
        var phone_number = req.body.originalRequest.data['From'];
        console.log("From = " + phone_number);
    }

    db.collection('employees').where("phone_number", "==", phone_number).get().then(function(t){ user_id = t.id});






    //This function handles all actions
    const actionHandlers = {

        //get_name
        'get_name': () => {

            console.log("Get name action handler called!!");
            console.log("Given Name is: " + given_name);

            const name = db
                .collection('employees')
                .where("first_name", "==", given_name)
                .get()
                .then(function (querySnapshot) {
                    if (querySnapshot.empty) {
                        console.log('no snapshot found');
                        res.status(200).json(formatResponse("I couldn't find anyone with that " + given_name));
                    }
                    else {
                        console.log(querySnapshot.size + " Snapshot found");
                        return querySnapshot.docs.forEach(function (doc) {
                            if (doc.exists) {
                                console.log("Found a doc " + doc.id);
                                console.log("Employee First Name:" + doc.get('first_name'));
                                res.status(200).json(formatResponse(doc.get('first_name') + " " + doc.get('last_name')));
                            }
                            else {
                                console.log("no document found");
                                res.status(200).json(formatResponse("I couldn't find anyone named " + given_name));
                            }
                        });
                    }
                });
        },


        'default': () => {
            console.log("Default action handler called!");
            res.json(formatResponse('Looks like something went really wrong. Don\'t worry I will notify someone' ));

        },

        'input.welcome': () => {


            const employee_match_phone = db.collection('employees')
                .where("phone_number", "==", phone_number);

            //See if the user's phone number is already registered
            employee_match_phone.get().then(function (snapShot) {
                //If no users with matching phone number
                if (snapShot.empty) {
                    res.json(formatResponse("Hi I’m BonneyBot 🤖! Enter your registration code to get started!"));
                }
                //if user with matching phone number
                else if (snapShot.size > 0) {
                    snapShot.forEach(function (doc) {
                        res.json(formatResponse("I see you there " + doc.get("first_name")));
                    })
                }
            })
                .catch(function (error) {
                    console.log("doc.get threw an error : " + error);
                })
        },

        'register': () => {
            const registration_code = parameters.registration_code;
            console.log("Registration Code: " + registration_code)

            //Query to find employee by phone number
            const employee_match_phone = db.collection('employees')
                .where("phone_number", "==", phone_number);
            const employee_match_registration = db.collection('employees')
                .where("registration_code", "==", registration_code);

            //See if the phone number is registered
            employee_match_phone.get().then(function (phoneSnapShot) {
                //If user is not registered
                if (phoneSnapShot.empty) {
                    //Search for an employee with a matching registration code
                    employee_match_registration.get().then(function (regSnapShot) {
                        //If not matching registration code
                        if (regSnapShot.empty) {
                            console.log("Snap Shot Size: " + regSnapShot.size);
                            res.json(formatResponse("I couldn't find the registration code "+ registration_code))
                        }
                        //If a matching registration code is found
                        else if (regSnapShot.size > 0) {
                            let employeeRef;
                            employee_match_registration.limit(1)
                                .get()
                                .then(docs => docs
                                    .forEach(function (doc){
                                        employeeRef = doc.id;
                                        updateEmployeePhone(employeeRef);
                                        const first_name = new Promise(function (resolve,reject) {
                                            let first_name = getEmployeeData(employeeRef,"first_name");
                                            if(typeof first_name != undefined){
                                                resolve(first_name);
                                            }
                                            else{
                                                reject("Shit Broke");
                                            }
                                            
                                        });

                                        console.log("First_name ==" + first_name);

                                        first_name.then(result => res.json(formatResponse("Thanks " + result + " you are all registered! I can now help you take notes just say \"Take a note\" ")));

                                    }

                                )
                            );

                        }
                    })
                }
                //if user is already registered
                else {
                    res.json(formatResponse("You are already registered. Try taking a note by saying \"Take a note\""))
                }
            })
        },

        'note' : () => {
            const note = parameters['note'];
            const member_first_name = parameters['given-name'];
            // const member_last_name = parameters.last-name;
            console.log("USER_ID = "+ user_id + " MEMBER_FIRST_NAME= " + member_first_name);

            //Find member who is on users team and has the same first name
            const member_name_match = db.collection('employees').where("leader_id", "==", user_id ).where("first_name", "==", member_first_name);

            //Find the team member id

            //TODO there could be more than one doc returned and that would be very bad with the code the way it is (ie multiple notes)

            member_name_match.get().then(docs => docs.forEach(function(doc){
                const member_id = doc.id;
                console.log("MEMBER_ID:"+ member_id);
                db.collection('employees').doc(member_id).collection("notes").add({
                    employee_id: member_id,
                    body:note
                }).then(function (docRef) {
                    res.json(formatResponse("Note added successfully"));

                }).catch(function (error) {
                    console.log("Error adding doc" + error);

                })


            }));

    }


    };

    // missing action will call default function.
    if (!actionHandlers[action]) {
        action = 'default';
    }

    // Call the handler with action type
    actionHandlers[action]();

    function updateEmployeePhone(employeeId){
        //update the employee's phone number
        db.collection("employees")
            .doc(employeeId)
            .update(
                {
                    "phone_number": phone_number
                }
            )
    }

    function getEmployeeData(employeeId, fieldPath){
           return db.collection("employees")
                .doc(employeeId)
                .get()
                .then(t => t.get(fieldPath)).catch(p1 => p1);
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