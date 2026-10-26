import "dotenv/config";
import express from "express";
import session from "express-session";
import { supabase, createUserClient } from "./supabase.mjs";

const app = express();

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        }
    })
);

// Login page
app.get("/", function (req, res) {
    if (req.session.user) {
        if (req.session.user.role === "staff") {
            return res.redirect("/staff");
        }
        return res.redirect("/fellow");
    }
    res.render("login", {
        error: null
    });
});

// Login 
app.post("/login", async function (req, res) {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");

    if (!email || !password) {
        return res.status(400).render("login", {
            error: "Enter your email and password"
        });
    }

    const loginResult = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (loginResult.error) {
        return res.status(401).render("login", {
            error: "Invalid email or password"
        });
    }

    const userClient = createUserClient(
        loginResult.data.session.access_token
    );

    const profileResult = await userClient
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", loginResult.data.user.id)
        .single();

    if (profileResult.error) {
        return res.status(500).send("Your profile could not be found");
    }

    req.session.user = {
        id: loginResult.data.user.id,
        email: loginResult.data.user.email,
        fullName: profileResult.data.full_name,
        role: profileResult.data.role,
        accessToken: loginResult.data.session.access_token
    };

    if (profileResult.data.role === "staff") {
        return res.redirect("/staff");
    }
    return res.redirect("/fellow");
});

// logout
app.post("/logout", function (req, res) {
    req.session.destroy(function (error) {
        if (error) {
            return res.send("Could not log out");
        }

        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

// fellow dashboard
app.get("/fellow", async function (req, res) {
    if (!req.session.user) {
        return res.redirect("/");
    }

    if (req.session.user.role !== "fellow") {
        return res.redirect("/staff");
    }

    const userClient = createUserClient(
        req.session.user.accessToken
    );

    const entriesResult = await userClient
        .from("service_entries")
        .select(`
      id, service_date, hours,
      service_description, people_helped,
      service_type, sites(name),
      areas(name), one_time_sites(name)
    `)
        .eq("fellow_id", req.session.user.id)
        .order("service_date", { ascending: false });

    if (entriesResult.error) {
        return res.status(500).send(entriesResult.error.message);
    }

    const entries = entriesResult.data || [];

    let totalHours = 0;
    let totalPeopleHelped = 0;

    for (const entry of entries) {
        totalHours =
            totalHours + Number(entry.hours || 0);

        totalPeopleHelped =
            totalPeopleHelped +
            Number(entry.people_helped || 0);
    }

    res.render("fellow_home", {
        user: req.session.user,
        entries: entries,
        stats: {
            totalHours: totalHours,
            totalPeopleHelped: totalPeopleHelped,
            entriesCount: entries.length
        }
    });
});

// Service-entry page
app.get("/service-entry", async function (req, res) {
    if (!req.session.user) {
        return res.redirect("/");
    }

    if (req.session.user.role !== "fellow") {
        return res.redirect("/staff");
    }

    const userClient = createUserClient(req.session.user.accessToken);

    const enrollmentResult = await userClient
        .from("enrollments")
        .select(`
      primary_site_id,sites(id,name,area_id)`)
        .eq("fellow_id", req.session.user.id)
        .eq("status", "active")
        .maybeSingle();

    if (enrollmentResult.error) {
        return res.status(500).send(enrollmentResult.error.message);
    }

    const sitesResult = await userClient
        .from("sites")
        .select("id, name, area_id")
        .eq("active", true)
        .order("name");

    if (sitesResult.error) {
        return res.status(500).send(sitesResult.error.message);
    }

    const oneTimeSitesResult = await userClient
        .from("one_time_sites")
        .select("id, name")
        .order("name");

    if (oneTimeSitesResult.error) {
        return res.status(500).send(oneTimeSitesResult.error.message);
    }

    const areasResult = await userClient
        .from("areas")
        .select("id, name")
        .order("name");

    if (areasResult.error) {
        return res.status(500).send(areasResult.error.message);
    }

    let primarySiteId = null;
    let primarySiteName = null;
    let primaryAreaId = null;

    if (enrollmentResult.data) {
        primarySiteId = enrollmentResult.data.primary_site_id;

        if (enrollmentResult.data.sites) {
            primarySiteName = enrollmentResult.data.sites.name;
            primaryAreaId = enrollmentResult.data.sites.area_id;
        }
    }

    res.render("service_entry", {
        user: req.session.user,
        sites: sitesResult.data || [],
        oneTimeSites: oneTimeSitesResult.data || [],
        areas: areasResult.data || [],
        primarySiteId: primarySiteId,
        primarySiteName: primarySiteName,
        primaryAreaId: primaryAreaId
    });
});

app.get("/api/questions", async function (req, res) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Not logged in" });
    }

    const serviceType = String(req.query.service_type || "");
    const siteId = String(req.query.site_id || "");

    if (!serviceType) {
        return res.status(400).json({ error: "Service type is required" });
    }

    const userClient = createUserClient(req.session.user.accessToken);

    if (serviceType === "one_time") {
        const questionsResult = await userClient
            .from("questions")
            .select(`id,question_text,answer_type,required`)
            .eq("service_type", "one_time")
            .order("id");

        if (questionsResult.error) {
            return res.status(500).json({ error: questionsResult.error.message });
        }
        return res.json({ questions: questionsResult.data || [] });
    }

    if (!siteId) {
        return res.json({ questions: [] });
    }

    const siteResult = await userClient
        .from("sites")
        .select("area_id")
        .eq("id", siteId)
        .single();

    if (siteResult.error) {
        return res.status(500).json({ error: siteResult.error.message });
    }

    const questionsResult = await userClient
        .from("questions")
        .select(`id, question_text, answer_type, required`)
        .eq("area_id", siteResult.data.area_id)
        .eq("service_type", "all")
        .order("id");

    if (questionsResult.error) {
        return res.status(500).json({ error: questionsResult.error.message });
    }
    res.json({ questions: questionsResult.data || [] });
});

app.post("/service-entry", async function (req, res) {
    if (!req.session.user) {
        return res.redirect("/");
    }

    if (req.session.user.role !== "fellow") {
        return res.redirect("/staff");
    }

    const serviceType = String(req.body.service_type || "");
    const serviceDate = String(req.body.service_date || "");
    const hours = Number(req.body.hours || 0);

    const peopleHelped = Number(req.body.people_helped || 0);
    const serviceDescription = String(req.body.service_description || "").trim();
    const concerns = String(req.body.concerns || "").trim();

    if (!serviceDate || hours <= 0 || !serviceType) {
        return res.status(400).send("Please complete the required fields.");
    }

    const userClient = createUserClient(req.session.user.accessToken);

    const enrollmentResult = await userClient
        .from("enrollments")
        .select("id")
        .eq("fellow_id", req.session.user.id)
        .eq("status", "active")
        .maybeSingle();

    if (enrollmentResult.error) {
        return res.status(500).send(enrollmentResult.error.message);
    }

    if (!enrollmentResult.data) {
        return res.status(400).send("No active enrollment was found.");
    }

    let siteId = null;
    let oneTimeSiteId = null;
    let areaId = null;

    if (serviceType === "regular") {
        siteId = Number(req.body.site_id || 0);

        if (siteId <= 0) {
            return res.status(400).send("Please select your primary site.");
        }
    }

    if (serviceType === "one_time") {
        const siteChoice = String(req.body.one_time_site_choice || "");

        if (siteChoice === "new") {
            const newSiteName = String(req.body.new_one_time_site_name || "").trim();

            if (!newSiteName) {
                return res.status(400).send("Please enter the new site name.");
            }

            const newSiteResult = await userClient
                .from("one_time_sites")
                .insert({
                    name: newSiteName,
                    created_by: req.session.user.id
                })
                .select("id")
                .single();

            if (newSiteResult.error) {
                return res.status(500).send(newSiteResult.error.message);
            }

            oneTimeSiteId = newSiteResult.data.id;
        }

        if (siteChoice.indexOf("official_") === 0) {
            siteId = Number(siteChoice.replace("official_", ""));
        }
        if (siteChoice.indexOf("temporary_") === 0) {
            oneTimeSiteId = Number(siteChoice.replace("temporary_", ""));
        }
        if (!siteId && !oneTimeSiteId) {
            return res.status(400).send("Please select or add a one-time site.");
        }
    }

    if (siteId) {
        const siteResult = await userClient
            .from("sites")
            .select("area_id")
            .eq("id", siteId)
            .single();

        if (siteResult.error) {
            return res.status(500).send(siteResult.error.message);
        }

        areaId = siteResult.data.area_id;
    }

    const entryResult = await userClient
        .from("service_entries")
        .insert({
            fellow_id: req.session.user.id,
            enrollment_id: enrollmentResult.data.id,
            site_id: siteId,
            one_time_site_id: oneTimeSiteId,
            area_id: areaId,
            service_type: serviceType,
            service_date: serviceDate,
            hours: hours,
            people_helped: peopleHelped,
            service_description: serviceDescription,
            concerns: concerns
        })
        .select("id")
        .single();

    if (entryResult.error) {
        return res.status(500).send(
            entryResult.error.message
        );
    }
    const answers = [];

    for (const fieldName in req.body) {
        if (fieldName.indexOf("question_") === 0) {
            const questionId = Number(fieldName.replace("question_", ""));

            const answerText = String(req.body[fieldName] || "").trim();

            if (questionId > 0 && answerText !== "") {
                answers.push({
                    entry_id: entryResult.data.id,
                    question_id: questionId,
                    answer_text: answerText
                });
            }
        }
    }

    if (answers.length > 0) {
        const answersResult = await userClient
            .from("entry_answers")
            .insert(answers);

        if (answersResult.error) {
            return res.status(500).send(answersResult.error.message);
        }
    }
    res.redirect("/fellow");
});

app.get("/staff/fellows", async function (req, res) {
    if (!req.session.user) {
        return res.redirect("/");
    }

    if (req.session.user.role !== "staff") {
        return res.redirect("/fellow");
    }

    const userClient = createUserClient(req.session.user.accessToken);

    const profilesResult = await userClient
        .from("profiles")
        .select("id, full_name");

    if (profilesResult.error) {
        return res.status(500).send(profilesResult.error.message);
    }

    const enrollmentsResult = await userClient
        .from("enrollments")
        .select(`fellow_id,
                    required_hours,sites(name)
                `)
        .eq("status", "active");

    if (enrollmentsResult.error) {
        return res.status(500).send(enrollmentsResult.error.message);
    }

    const entriesResult = await userClient
        .from("service_entries")
        .select(`
                fellow_id,hours,
                service_date
            `);

    if (entriesResult.error) {
        return res.status(500).send(entriesResult.error.message);
    }

    const profiles = profilesResult.data || [];
    const entries = entriesResult.data || [];
    const fellows = [];

    for (const enrollment of enrollmentsResult.data || []) {
        let fellowName = "Unknown fellow";

        for (const profile of profiles) {
            if (profile.id === enrollment.fellow_id) {
                fellowName = profile.full_name;
                break;
            }
        }

        let totalHours = 0;
        let lastEntry = "";

        for (const entry of entries) {
            if (entry.fellow_id === enrollment.fellow_id) {
                totalHours = totalHours + Number(entry.hours || 0);

                if (entry.service_date > lastEntry) {
                    lastEntry = entry.service_date;
                }
            }
        }

        let status = "Not started";

        if (totalHours > 0) {
            status = "In progress";
        }

        if (totalHours >= Number(enrollment.required_hours || 0)
        ) {
            status = "Complete";
        }

        let primarySite = "Not assigned";

        if (enrollment.sites) {
            primarySite = enrollment.sites.name;
        }

        fellows.push({
            id: enrollment.fellow_id,
            name: fellowName,
            primarySite: primarySite,
            totalHours: totalHours,
            requiredHours: enrollment.required_hours,
            lastEntry: lastEntry,
            status: status
        });
    }

    res.render("staff_fellow_progress", { user: req.session.user, fellows: fellows });
}
);

app.get("/staff/entries", async function (req, res) {
    if (!req.session.user) {
        return res.redirect("/");
    }

    if (req.session.user.role !== "staff") {
        return res.redirect("/fellow");
    }

    const userClient = createUserClient(req.session.user.accessToken);

    const entriesResult = await userClient
        .from("service_entries")
        .select(`
                id,
                fellow_id,
                service_date,
                hours,
                people_helped,
                service_type,
                sites(name),
                areas(name),
                one_time_sites(name)
            `)
        .order("service_date", { ascending: false });

    if (entriesResult.error) {
        return res.status(500).send(entriesResult.error.message);
    }

    const profilesResult = await userClient
        .from("profiles")
        .select("id, full_name");

    if (profilesResult.error) {
        return res.status(500).send(profilesResult.error.message);
    }

    const profiles = profilesResult.data || [];

    const serviceEntries = entriesResult.data || [];

    for (const entry of serviceEntries) {
        entry.fellowName = "Unknown fellow";

        for (const profile of profiles) {
            if (profile.id === entry.fellow_id) {
                entry.fellowName = profile.full_name;
                break;
            }
        }

        entry.siteName = "Not listed";

        if (entry.sites) {
            entry.siteName = entry.sites.name;
        }

        if (entry.one_time_sites) {
            entry.siteName = entry.one_time_sites.name;
        }

        entry.areaName = "Not listed";

        if (entry.areas) {
            entry.areaName = entry.areas.name;
        }
    }

    res.render("staff_entries", {
        user: req.session.user,
        serviceEntries: serviceEntries
    }
    );
}
);

// Admin/staff part
app.get("/staff", async function (req, res) {
    if (!req.session.user) {
        return res.redirect("/");
    }

    if (req.session.user.role !== "staff") {
        return res.redirect("/fellow");
    }

    const userClient = createUserClient(req.session.user.accessToken);

    const selectedSiteId = "";

    let entriesQuery = userClient
        .from("service_entries")
        .select(`
            id, fellow_id, service_date,
            hours, people_helped,
            service_description, service_type,
            site_id, sites(name),
            one_time_sites(name)
        `)
        .order("service_date", { ascending: false });

    const entriesResult = await entriesQuery;

    if (entriesResult.error) {
        return res.status(500).send(entriesResult.error.message);
    }

    const entries = entriesResult.data || [];

    const sitesResult = await userClient
        .from("sites")
        .select("id, name")
        .eq("active", true)
        .order("name");

    if (sitesResult.error) {
        return res.status(500).send(sitesResult.error.message);
    }

    const profilesResult = await userClient
        .from("profiles")
        .select("id, full_name");

    if (profilesResult.error) {
        return res.status(500).send(profilesResult.error.message);
    }

    const profiles = profilesResult.data || [];

    for (const entry of entries) {
        entry.fellow_name = "Unknown fellow";

        for (const profile of profiles) {
            if (profile.id === entry.fellow_id) {
                entry.fellow_name = profile.full_name;
                break;
            }
        }
    }

    let totalHours = 0;
    let totalPeopleHelped = 0;

    for (const entry of entries) {
        totalHours = totalHours + Number(entry.hours || 0);
        totalPeopleHelped = totalPeopleHelped + Number(entry.people_helped || 0);
    }

    const today = new Date();

    const dayOfWeek =
        today.getDay();

    let daysSinceMonday =
        dayOfWeek - 1;

    if (dayOfWeek === 0) {
        daysSinceMonday = 6;
    }

    const monday = new Date(today);

    monday.setDate(
        today.getDate() - daysSinceMonday
    );

    const mondayString =
        monday.toISOString().slice(0, 10);

    const activeEnrollmentsResult =
        await userClient
            .from("enrollments")
            .select("fellow_id")
            .eq("status", "active");

    if (activeEnrollmentsResult.error) {
        return res.status(500).send(
            activeEnrollmentsResult.error.message
        );
    }

    const weeklyEntriesResult =
        await userClient
            .from("service_entries")
            .select("fellow_id")
            .gte("service_date", mondayString);

    if (weeklyEntriesResult.error) {
        return res.status(500).send(
            weeklyEntriesResult.error.message
        );
    }

    const submittedFellowIds = [];

    for (const entry of weeklyEntriesResult.data || []) {
        if (!submittedFellowIds.includes(entry.fellow_id)) {
            submittedFellowIds.push(entry.fellow_id);
        }
    }

    const weeklyAlerts = [];

    for (const enrollment of activeEnrollmentsResult.data || []) {
        if (!submittedFellowIds.includes(enrollment.fellow_id)) {
            let fellowName = "Unknown fellow";

            for (const profile of profiles) {
                if (profile.id === enrollment.fellow_id) {
                    fellowName = profile.full_name;
                    break;
                }
            }
            weeklyAlerts.push({ fellowName: fellowName });
        }
    }

    res.render("staff_home", {
        user: req.session.user,
        entries: entries,
        sites: sitesResult.data || [],
        selectedSiteId: selectedSiteId,
        weeklyAlerts: weeklyAlerts,
        stats: {
            totalHours: totalHours,
            totalPeopleHelped: totalPeopleHelped,
            entriesCount: entries.length
        }
    });
});

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

const port = process.env.PORT || 3000;

app.listen(port, function () {
    console.log("Server running at http://localhost:" + port);
});


