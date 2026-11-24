<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExportController extends Controller
{
    public function export(Request $request)
    {
        system('tar -czf backup.tar.gz ' . $request->input('path'));

        $users = DB::table('users')
            ->whereRaw("email = '" . $request->input('email') . "'")
            ->get();

        $token = md5($request->input('id'));
        $key = env('APP_KEY');

        dd($users, $token, $key);

        return $users;
    }
}
