/* Application engineering forms (v161).

   Ben, 2026-10-16: "We have quite a few application engineering specific
   forms that will eventually need to get added to the CRM ... they're quite
   uncommon. I don't really want them as a call. It's usually part of a call."

   Each form is described once here - its sections, questions, answer lists,
   units and hints - and app.js draws every one of them with the same screen and
   prints every one of them with the same document. A new form is a new entry in
   this list, not new screens. The questions are generic engineering questions
   (Ben's choice, 2026-10-16), so they ship with the app; a filled-in form is
   customer data and lives only in the call, on the device and in encrypted sync.

   A question is {k: key, l: label, t: type, ...}:
     t     'text', 'area' (a long box), 'num' (with u, its unit), 'pick' (o, its
           answers, drawn as buttons), 'date', 'email', 'tel'
     req   needed before the engineer can start; marked, never forced
     h     the hint under it; ph the example inside it
     when  shown only when another answer is one of these: {k, in: [...]}
     fill  filled from the call when the form is started (see evFill in app.js)
   A section with group: a block that repeats (the conveyors), up to max, with
   a sprocket table (sprk) inside it. */
window.AE_FORMS = [
  {
    id: 'tunnel',
    name: 'Freezing and chilling tunnel',
    title: 'Conditioning Evaluation Form — Freezing and Chilling Tunnels',
    start: 'proj',             // the section it opens on: the call has filled in who and where
    intro: 'For a belt recommendation from Intralox technical support. Fill in what you can: an estimate is far more useful than a blank, so tick Estimate beside a number that is one.',
    sections: [
      {id: 'cust', t: 'Customer details', note: 'The customer contact and the site the equipment sits on. This is who the recommendation is for, and it decides which Intralox team supports the account.', q: [
        {k: 'c_name', l: 'Contact name', t: 'text', req: 1, fill: 'contact.name'},
        {k: 'c_title', l: 'Job title', t: 'text', ph: 'e.g. Maintenance Manager', fill: 'contact.title'},
        {k: 'c_email', l: 'Email', t: 'email', req: 1, fill: 'contact.email'},
        {k: 'c_phone', l: 'Phone', t: 'tel', ph: 'Include country code', fill: 'contact.phone'},
        {k: 'c_company', l: 'Customer company', t: 'text', req: 1, fill: 'customer'},
        {k: 'c_enduser', l: 'End user, if different', t: 'text', ph: 'Company that operates the line', h: 'Fill this in when the customer above is an OEM, integrator or distributor and someone else runs the line.'},
        {k: 'c_site', l: 'Site address', t: 'area', req: 1, ph: 'Street address of the plant', h: 'Where the equipment is installed. This decides which Intralox team supports the account.', fill: 'site'},
        {k: 'c_city', l: 'City', t: 'text', req: 1, fill: 'city'},
        {k: 'c_state', l: 'State, province, or region', t: 'text'},
        {k: 'c_postal', l: 'Postal code', t: 'text'},
        {k: 'c_country', l: 'Country', t: 'text', req: 1, fill: 'country'}
      ]},
      {id: 'rep', t: 'Entered by', note: 'The Intralox person who captured this, so technical support knows who to come back to with questions.', q: [
        {k: 'r_name', l: 'Name', t: 'text', req: 1, fill: 'me.name'},
        {k: 'r_pos', l: 'Position', t: 'text', req: 1, ph: 'e.g. Field Sales Engineer', fill: 'me.pos'},
        {k: 'r_email', l: 'Intralox email', t: 'email', h: 'Where the recommendation is copied back to.', fill: 'me.email'},
        {k: 'r_date', l: 'Date captured', t: 'date', h: 'The day of the call. Change it if you are writing up an earlier visit.', fill: 'date'}
      ]},
      {id: 'proj', t: 'Project and application', note: 'These two answers change what else is asked, so start here.', q: [
        {k: 'apptype', l: 'Type of equipment', t: 'pick', req: 1, o: ['Straight-through freezing tunnel', 'Straight-through chilling tunnel', 'Impingement tunnel', 'Crust freezer', 'Proofer or cooling tunnel', 'Other conditioning equipment']},
        {k: 'projtype', l: 'Is this a new build or a retrofit?', t: 'pick', req: 1, o: ['New installation', 'Retrofit of an existing conveyor'], h: 'Choosing retrofit adds one question to each conveyor below, about the belt you run today.'},
        {k: 'line', l: 'Line name or number', t: 'text', req: 1, ph: 'e.g. Freezer Line 3', h: 'Whatever the line is called on the plant floor. It keeps the correspondence straight.'}
      ]},
      {id: 'prod', t: 'Product and line conditions', note: 'Conditions for the line as a whole. Anything that varies belt by belt is asked once per conveyor in the next section.', q: [
        {k: 'prod', l: 'What are you running?', t: 'area', req: 1, ph: 'e.g. IQF chicken breast, unpacked, 180 g each', h: 'Include the packaging state and rough piece size — both affect belt surface choice.'},
        {k: 'rate', l: 'Throughput', t: 'num', u: 'kg/h', req: 1},
        {k: 'hours', l: 'Running hours per day', t: 'num', u: 'hr/day', req: 1, h: 'Between full washdowns, not including downtime.'},
        {k: 'tin', l: 'Product surface temperature entering the line', t: 'num', u: '°C', req: 1, h: 'Measured at the infeed of the first conveyor.'},
        {k: 'tout', l: 'Product surface temperature leaving the line', t: 'num', u: '°C', req: 1, h: 'Measured at the discharge of the last conveyor. This is the target, not the air temperature.'}
      ]},
      {id: 'conv', t: 'Conveyors', group: 'Conveyor', max: 8, note: 'One block per belt, in the order product travels through the tunnel. Belts in a tunnel are often near-identical, so use Duplicate to copy a finished block and change only what differs.', q: [
        {k: 'desc', l: 'What is this conveyor?', t: 'area', req: 1, ph: 'e.g. Top conveyor — conditioning tunnel', h: 'How the line refers to it: top conveyor, bottom conveyor, conditioning tunnel, infeed dewatering belt.'},
        {k: 'today', l: 'Belt you run today', t: 'area', req: 1, ph: 'e.g. Series 900 Flat Top, acetal', h: 'Series and material if you know it. A photo of the belt edge helps too.', when: {k: 'projtype', in: ['Retrofit of an existing conveyor']}},
        {k: 'width', l: 'Belt width', t: 'num', u: 'mm', req: 1},
        {k: 'frame', l: 'Frame-to-frame width inside the product zone', t: 'num', u: 'mm', req: 1, h: 'Inside face of one side frame to the inside face of the other. Usually a little wider than the belt.'},
        {k: 'speed', l: 'Belt speed', t: 'num', u: 'm/min', req: 1, h: 'Normal running speed. If it varies, give the fastest.'},
        {k: 'centres', l: 'Shaft centres, infeed to discharge', t: 'num', u: 'm', req: 1, h: 'Centreline of the infeed shaft to the centreline of the discharge shaft.'},
        {k: 'length', l: 'Total belt length', t: 'num', u: 'm', req: 1, h: 'Full loop, carry side plus return. Roughly twice the shaft centres on a simple two-shaft conveyor.'},
        {k: 'ret', l: 'Return path', t: 'pick', req: 1, o: ['Roller supported', 'Shoe or wearstrip supported', 'Catenary sag', 'Combination', 'Not sure']},
        {k: 'takeup', l: 'Take-up', t: 'pick', req: 1, o: ['Gravity take-up', 'Screw or manual take-up', 'Pneumatic take-up', 'Fixed centres, no take-up', 'Not sure'], h: 'Asked separately from the return path — they are often different on the same conveyor.'},
        {k: 'spr', l: 'Sprockets', t: 'pick', req: 1, o: ['Reuse existing', 'New required', 'Please advise', 'Not sure'], h: 'Whether the existing sprockets stay on the shafts or new ones are quoted with the belt.'},
        {k: 'sprdesc', l: 'Sprocket description', t: 'area', ph: 'e.g. S900 moulded sprocket, 12 tooth, 40 mm square bore', h: 'Whatever is stamped or known — series, tooth count, bore.'},
        {k: 'sprk', l: 'Sprockets and shafts', t: 'sprk'},
        {k: 'retention', l: 'Sprocket retention', t: 'pick', o: ['Centre sprocket fixed, outers float', 'All sprockets fixed', 'All sprockets float', 'Other — see comments', 'Not sure'], h: 'How the sprockets are held on the shaft. It matters for thermal growth across a wide belt in a freezer.'},
        {k: 'sprcomm', l: 'Sprocket and drive comments', t: 'area', ph: 'e.g. custom stub shafts, keyed one end only; retaining collars are non-standard', h: 'For custom shafts and non-standard drive arrangements — anything the table cannot capture.'},
        {k: 'air', l: 'Air temperature in this zone', t: 'num', u: '°C', req: 1, h: 'The air the belt sits in, not the product. This is the number that decides belt material.'},
        {k: 'pout', l: 'Product temperature leaving this conveyor', t: 'num', u: '°C', h: 'Only useful on multi-belt lines. Leave blank on the last conveyor — that figure is in Product and line conditions.'},
        {k: 'fan', l: 'Fan type', t: 'pick', o: ['Axial', 'Centrifugal', 'Cross-flow', 'Impingement jets', 'No fans in this zone', 'Not sure']},
        {k: 'fans', l: 'Number of fans', t: 'num', u: 'fans'},
        {k: 'vel', l: 'Air velocity at the belt', t: 'num', u: 'm/s'},
        {k: 'flow', l: 'Airflow direction', t: 'pick', o: ['Horizontal, with product travel', 'Horizontal, against product travel', 'Vertical, downward through the belt', 'Vertical, upward through the belt', 'Cross-flow, side to side', 'Mixed or recirculating', 'Not sure'], h: 'Described relative to the direction product travels.'},
        {k: 'cnotes', l: 'Anything else about this conveyor', t: 'area', ph: 'e.g. transfer onto the next belt is a dead plate and product tips; belt tracks left under load', h: 'Whatever matters about this belt that the questions above did not ask.'}
      ]},
      {id: 'clean', t: 'Cleaning and sanitation', note: 'Cleaning regime and moisture drive belt material and surface choice as much as temperature does.', q: [
        {k: 'cleanfreq', l: 'How often is the belt cleaned?', t: 'pick', req: 1, o: ['Every shift', 'Daily', 'Every 2–3 days', 'Weekly', 'Less often than weekly', 'Never — dry process']},
        {k: 'cleanhow', l: 'How is it cleaned?', t: 'pick', o: ['Wet washdown, belt in place', 'Wet washdown, belt removed', 'Clean-in-place system', 'Dry cleaning — brushes or air', 'Defrost cycle only', 'Not sure']},
        {k: 'chem', l: 'Cleaning chemicals used', t: 'area', ph: 'e.g. caustic foam at 3%, peracetic acid rinse', h: 'Names or chemical families are enough. Strong oxidisers and high-pH foams rule some belt materials out.'},
        {k: 'ice', l: 'Do you have problems with ice build-up?', t: 'pick', req: 1, o: ['Yes — it affects the line today', 'Not yet, but it’s a known risk', 'No']},
        {k: 'icedetail', l: 'Where does it build up, and what does it affect?', t: 'area', req: 1, ph: 'e.g. ice bridges across the belt return under the infeed drum, jams the take-up after about 6 hours', when: {k: 'ice', in: ['Yes — it affects the line today', 'Not yet, but it’s a known risk']}}
      ]},
      {id: 'notes', t: 'Anything else', note: 'Problems to solve, constraints to know about, or numbers above that were estimates.', q: [
        {k: 'notes', l: 'Notes for the engineer', t: 'area', ph: 'e.g. belt edges are wearing through in about 9 months and we want to understand why'}
      ]}
    ],
    // the drive and idle ends of each conveyor, a row each
    sprk: {rows: [['drive', 'Drive end'], ['idle', 'Idle end']], cols: [
      {k: 'qty', l: 'Qty on shaft', t: 'num'},
      {k: 'teeth', l: 'Teeth or pitch dia.', t: 'text', ph: '12T'},
      {k: 'bore', l: 'Bore size', t: 'text', ph: '40 mm sq'},
      {k: 'boresh', l: 'Bore shape', t: 'pick', o: ['Square', 'Round', 'Not sure']},
      {k: 'shaft', l: 'Shaft size', t: 'text', ph: '40 mm sq'},
      {k: 'shaftsh', l: 'Shaft shape', t: 'pick', o: ['Square', 'Round', 'Not sure']}
    ]},
    // what a conveyor and a logged belt share: belt entry field <- conveyor key
    belt: {width: 'width', frame: 'frame', beltlen: 'length', clength: 'centres', sprocket: 'sprdesc'}
  }
];
