<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProposalRequest;
use App\Models\Proposal;
use Illuminate\Http\Request;

class ProposalController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        return Proposal::latest()->get();
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(ProposalRequest $request)
    {
        return Proposal::create($request->validated());
    }

    /**
     * Display the specified resource.
     */
    public function show(Proposal $proposal)
    {
        return $proposal;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(ProposalRequest $request, Proposal $proposal)
    {
        $proposal->update($request->validated());

        return $proposal;
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Proposal $proposal)
    {
        $proposal->delete();

        return response()->noContent();
    }

    public function clear()
    {
        Proposal::truncate();
        return response()->json(['message' => 'Propostas removidas com sucesso.']);
    }
}
