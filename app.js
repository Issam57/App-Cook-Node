const express = require("express")
const app = express()
const dotenv = require("dotenv").config()

const bodyParser = require("body-parser")
const ejs = require("ejs")
const mongoose = require("mongoose")
const PORT = process.env.PORT || 3000
const randToken = require("rand-token")
const nodemailer = require("nodemailer")

const session = require("express-session")
const passport = require("passport")
const passportLocalMongoose = require("passport-local-mongoose")

//MODELS
const User = require("./models/user")
const Reset = require("./models/reset")
const Receipe = require("./models/receipe")
const Ingredient = require("./models/ingredient")
const Favourite = require("./models/favourite")
const Schedule = require("./models/schedule")

//SESSION
app.use(session({
    secret: "mysecret",
    resave: false,
    saveUninitialized: false
}))

// //PASSPORT
app.use(passport.initialize())
app.use(passport.session())

mongoose.connect("mongodb+srv://staiifi57:261285@cluster0.ialga.mongodb.net/cooking?retryWrites=true&w=majority", 
    {   
        useNewUrlParser: true, 
        useUnifiedTopology: true,
        useFindAndModify: false
    })

    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function() {
        console.log('Vous êtes connecté à la base')
    });

//PASSPORT LOCAL MONGOOSE
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//EJS
app.set("view engine", "ejs")

//PUBLIC FOLDER
app.use(express.static("public"))

//BODY-PARSER
app.use(bodyParser.urlencoded({extended : false}))



const methodOverride = require("method-override")
const flash = require("connect-flash")
app.use(flash())
app.use(methodOverride('_method'))

app.use((req,res,next) => {
    res.locals.currentUser = req.user
    res.locals.error = req.flash("error")
    res.locals.success = req.flash("success")
    next()
})

app.get("/", (req,res) => {
    res.render("index")
})

app.get("/signup", (req,res) => {
    res.render("signup")
})

app.post("/signup", (req,res) => {
    const newUser = new User({
        username: req.body.username
    })
    User.register(newUser, req.body.password, (err, user) => {
        if(err) {
            console.log(err)
            return res.render("signup")
        } else {
            passport.authenticate("local")(req,res, () => {
                req.flash("success", "Bravo ! Vous êtes inscrit. Vous pouvez vous connecter")
                res.redirect("login")
            })
        }
    })
})

app.get("/login", (req,res) => {
    res.render("login")
})

app.post("/login", (req,res) => {
    const user = new User({
        username: req.body.username,
        password: req.body.password
    })
    req.login(user, (err) => {
        if(err) {
            console.log(err)
        } else {
            passport.authenticate("local")(req,res, () => {
                
                res.redirect("/dashboard")
            })
        }
    })
})

app.get("/dashboard", isLoggedIn, (req,res) => {
    res.render("dashboard")
})

app.get("/logout", (req,res) => {
    req.logout()
    req.flash("success", "Vous êtes déconnecté")
    res.redirect("login")
})

app.get("/forgot", (req,res) => {
    res.render("forgot")
})

app.post("/forgot", (req,res) => {
    User.findOne({username: req.body.username}, (err, userFound) => {
        if(err) {
            console.log(err)
            res.redirect("login")
        } else {

            const token = randToken.generate(16)
            Reset.create({
                username: userFound.username,
                resetPasswordToken: token,
                resetPasswordExpires: Date.now() + 3600000
            })
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'staiifi57@gmail.com',
                    pass: process.env.PWD
                }
            })
            const mailOptions = {
                from: 'staiifi57@gmail.com',
                to: req.body.username,
                subject: 'Reset votre mot de passe',
                text: 'Cliquez sur ce lien pour reset votre mot de passe: http://localhost:3000/reset/'+ token
            }
            console.log("L'email est prêt a être envoyé")

            transporter.sendMail(mailOptions, (err, response) => {
                if(err) {
                    console.log(err)
                } else {
                    req.flash("success", "Bravo ! Votre email a bien été envoyé")
                    res.redirect("/login")
                }
            })
        }
    })
})

app.get("/reset/:token", (req,res) => {
    Reset.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: {$gt: Date.now()}
    }, (err, obj) => {
        if(err) {
            console.log("token expired")
            res.redirect('login')
        } else {
            res.render('reset', {token: req.params.token})
        }
    })
})

app.post("/reset/:token", (req,res) => {
    Reset.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: {$gt: Date.now()}
    }, (err, obj) => {
        if(err) {
            console.log("token expired")
            req.flash("error", "Erreur ! Token expiré")
            res.redirect('login')
        } else {
            if(req.body.password == req.body.password2) {
                User.findOne({username: obj.username}, (err, user) => {
                    if(err) {
                        console.log(err)
                    } else {
                        user.setPassword(req.body.password, (err) => {
                            if(err) {
                                console.log(err)
                            } else {
                                user.save()
                                const updatedReset = {
                                    resetPasswordToken: null,
                                    resetPasswordExpires: null
                                }
                                Reset.findOneAndUpdate({resetPasswordToken: req.params.token}, updatedReset, (err, obj1) => {
                                    if(err) {
                                        console.log(err)
                                    } else {
                                        res.redirect("login")
                                    }
                                })
                            }
                        })
                    }
                })
            }
        }
    })
})

//RECEIPE ROUTE
app.get("/dashboard/myreceipes", isLoggedIn, (req,res) => {
    Receipe.find({
        user: req.user.id
    }, (err, receipe) => {
        if(err) {
            console.log(err)
        } else {
            res.render("receipe", {receipe: receipe});
        }
    })
})

app.get("/dashboard/newreceipe", isLoggedIn, (req,res) => {
    res.render("newreceipe")
})

app.post("/dashboard/newreceipe", (req,res) => {
    const newReceipe = {
        name: req.body.receipe,
        image: req.body.logo,
        user: req.user.id
    }
    Receipe.create(newReceipe, (err, newReceipe) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Nouvelle recette ajoutée");
            res.redirect("/dashboard/myreceipes")
        }
    })
})

app.get("/dashboard/myreceipes/:id", (req,res) => {
    Receipe.findOne({user: req.user.id, _id: req.params.id}, (err, receipeFound) => {
        if(err) {
            console.log(err)
        } else {
            Ingredient.find({
                user: req.user.id,
                receipe: req.params.id
            }, (err, ingredientFound) => {
                if(err) {
                    console.log(err)
                } else {
                    res.render("ingredients", {
                        ingredient: ingredientFound,
                        receipe: receipeFound
                    })
                }
            })
        }
    })
})

app.delete("/dashboard/myreceipes/:id", isLoggedIn, (req,res) => {
    Receipe.deleteOne({_id: req.params.id}, (err) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Votre recette a bien été supprimée")
            res.redirect("/dashboard/myreceipes")
        }
    })
})

//INGREDIENT ROUTES
app.get("/dashboard/myreceipes/:id/newingredient", (req,res) => {
    Receipe.findById({_id: req.params.id}, (err, found) => {
        if(err) {
            console.log(err)
        } else {
            res.render("newingredient", {receipe: found})
        }
    })
})

app.post("/dashboard/myreceipes/:id", (req,res) => {
    const newIngredient = {
        name: req.body.name,
        bestDish: req.body.dish,
        user: req.user.id,
        quantity: req.body.quantity,
        receipe: req.params.id
    }
    Ingredient.create(newIngredient, (err, newIngredient) => {
        if(err) {
            console.log(err)
        } else{
            req.flash("success", "Votre ingrédient a bien été ajouté")
            res.redirect("/dashboard/myreceipes/"+req.params.id)
        }
    })
})

app.delete("/dashboard/myreceipes/:id/:ingredientid", isLoggedIn, (req,res) => {
    Ingredient.deleteOne({_id: req.params.ingredientid}, (err) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Votre ingrédient a été supprimé")
            res.redirect("/dashboard/myreceipes/"+req.params.id)
        }
    })
})

app.post("/dashboard/myreceipes/:id/:ingredientid/edit", (req,res) => {
    Receipe.findOne({user: req.user.id, _id: req.params.id}, (err, receipeFound) => {
        if(err) {
            console.log(err0)
        } else {
            Ingredient.findOne({
                _id: req.params.ingredientid,
                receipe: req.params.id
            }, (err, ingredientFound) => {
                if(err) {
                    console.log(err)
                } else {
                    res.render("edit", {
                        ingredient: ingredientFound,
                        receipe: receipeFound
                    })
                }
            })
        }
    })
})

app.put("/dashboard/myreceipes/:id/:ingredientid", isLoggedIn, (req,res) => {
    const ingredient_updated = {
        name: req.body.name,
        bestDish: req.body.dish,
        user: req.user.id,
        quantity: req.body.quantity,
        receipe: req.params.id,
    }
    Ingredient.findByIdAndUpdate({_id: req.params.ingredientid}, ingredient_updated, (err, updatedIngredient) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "L'ingredient a bien été modifié")
            res.redirect("/dashboard/myreceipes/"+ req.params.id)
        }
    })
})

//FAVOURITE ROUTES
app.get("/dashboard/favourites", isLoggedIn, (req,res) => {
    Favourite.find({user: req.user.id}, (err, favourite) => {
        if(err) {
            console.log(err)
        } else {
            res.render("favourites", {favourite: favourite})
        }
    })
})

app.get("/dashboard/favourites/newfavourite", isLoggedIn, (req,res) => {
    res.render("newfavourite")
})

app.post("/dashboard/favourites", isLoggedIn, (req,res) => {
    const newFavourite = {
        image: req.body.image,
        title: req.body.title,
        description: req.body.description,
        user: req.user.id
    }
    Favourite.create(newFavourite, (err, newFavourite) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Votre recette favorite a bien été ajouté")
            res.redirect("/dashboard/favourites")
        }
    })
})

app.delete("/dashboard/favourites/:id", isLoggedIn, (req,res) => {
    Favourite.deleteOne({_id: req.params.id}, (err) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Vous avez supprimez avec succès")
            res.redirect("/dashboard/favourites")
        }
    })
})

//SCHEDULE ROUTES
app.get("/dashboard/schedule", isLoggedIn, (req,res) => {
    Schedule.find({user: req.user.id}, (err, schedule) => {
        if(err) {
            console.log(err)
        } else {
            res.render("schedule", {schedule: schedule})
        }
    })
})

app.get("/dashboard/schedule/newschedule", isLoggedIn, (req,res) => {
    res.render("newSchedule")
})

app.post("/dashboard/schedule", isLoggedIn, (req,res) => {
    const newSchedule = {
        ReceipeName: req.body.receipename,
        scheduleDate: req.body.scheduleDate,
        user: req.user.id,
        time: req.body.time
    }
    Schedule.create(newSchedule, (err, newSchedule) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Vous avez bien ajouté")
            res.redirect("/dashboard/schedule")
        }
    })
})

app.delete("/dashboard/schedule/:id", isLoggedIn, (req,res) => {
    Schedule.deleteOne({_id: req.params.id}, (err) => {
        if(err) {
            console.log(err)
        } else {
            req.flash("success", "Vous avez bien supprimé")
            res.redirect("/dashboard/schedule")
        }
    })
})


//FONCTION DE CONNEXION
function isLoggedIn(req,res,next) {
    if(req.isAuthenticated()) {
        return next()
    } else {
        req.flash("error", "Veuillez d'abord vous connecter svp")
        res.redirect("login")
    }
}



app.listen(PORT, (req,res) => {
    console.log(`Le serveur tourne sur le port ${PORT}`)
});