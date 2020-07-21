
const firebase = require('firebase');
const functions = require('firebase-functions');

const app = require('express')();

const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

const config = {
    apiKey: "AIzaSyADRFKAf4A-2OH165xkMKHOSgmuxbjFENc",
    authDomain: "functon-test.firebaseapp.com",
    databaseURL: "https://functon-test.firebaseio.com",
    projectId: "functon-test",
    storageBucket: "functon-test.appspot.com",
    messagingSenderId: "16921639841",
    appId: "1:16921639841:web:9e8d22dbbe5a3bf4d229e0",
    measurementId: "G-528T24NEN3"
};

firebase.initializeApp(config)


app.post('/signup', (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    };

    const noImg = 'no-img.jpg';

    let token, userId;
    db.doc(`/users/${newUser.handle}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                return res.status(400).json({ handle: "this handle is already taken" });
            } else {
                return firebase
                    .auth()
                    .createUserWithEmailAndPassword(newUser.email, newUser.password);
            }
        })
        .then((data) => {
            userId = data.user.uid;
            return data.user.getIdToken();
        })
        .then((idToken) => {
            token = idToken;
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                imgUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
                userId,
            };
            return db.doc(`/users/${newUser.handle}`).set(userCredentials);
        })
        .then(() => {
            return res.status(201).json({ token });
        })
        .catch((err) => {
            console.error(err);
            if (err.code === "auth/email-already-in-use") {
                return res.status(400).json({ email: "Email is already is use" });
            } else {
                return res
                    .status(500)
                    .json({ general: "Something went wrong, please try again" });
            }
        });
})

app.post('/signin', (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    };

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
        .then(data => {
            return data.user.getIdToken();
        })
        .then(token => {
            return res.status(201).json({ token })
        })
        .catch(err => {
            console.error(err);
            return res.status(500).json({ error: 'something went wrong' })
        })
})

const FBAuth = (req, res, next) => {
    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        idToken = req.headers.authorization.split('Bearer ')[1];
    } else {
        console.error('no token found');
        return res.status(400).json({ error: 'unauthorized' })
    }

    admin.auth().verifyIdToken(idToken).then(decodedToken => {
        req.user = decodedToken;
        console.log(decodedToken);
        return db.collection('users').where('userId', '==', req.user.uid)
            .limit(1)
            .get();

    }).then(data => {
        req.user.handle = data.docs[0].data().handle;
        return next();
    })
        .catch(err => {
            console.error(err);
            return res.status(403).json(err)
        })
}

app.post('/image', FBAuth, (req, res) => {
    const BusBoy = require("busboy");
    const path = require("path");
    const os = require("os");
    const fs = require("fs");

    const busboy = new BusBoy({ headers: req.headers });

    let imageToBeUploaded = {};
    let imageFileName;
    // String for image token

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
        console.log(fieldname, file, filename, encoding, mimetype);
        if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
            return res.status(400).json({ error: "Wrong file type submitted" });
        }
        // my.image.png => ['my', 'image', 'png']
        const imageExtension = filename.split(".")[filename.split(".").length - 1];
        // 32756238461724837.png
        imageFileName = `${Math.round(
            Math.random() * 1000000000000
        ).toString()}.${imageExtension}`;
        const filepath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = { filepath, mimetype };
        file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on("finish", () => {
        admin
            .storage()
            .bucket(config.storageBucket)
            .upload(imageToBeUploaded.filepath, {
                resumable: false,
                metadata: {
                    metadata: {
                        contentType: imageToBeUploaded.mimetype,
                    },
                },
            })
            .then(() => {
                // Append token to url
                const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
                return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
            })
            .then(() => {
                return res.json({ message: "image uploaded successfully" });
            })
            .catch((err) => {
                console.error(err);
                return res.status(500).json({ error: "something went wrong" });
            });
    });
    busboy.end(req.rawBody);
});

exports.api = functions.region('europe-west1').https.onRequest(app);